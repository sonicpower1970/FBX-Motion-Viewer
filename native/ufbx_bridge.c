// Project-owned bridge. ufbx stays unmodified in vendor/ufbx.
#include "ufbx.h"
#include <emscripten.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

EM_JS(void, begin_result, (), {
    Module.result = { nodes: [], meshes: [], materials: [], clips: [], warnings: [] };
    Module.outputBytes = 0;
    Module.copy = (ptr, count, kind) => {
        const heap = kind === 'u32' ? HEAPU32 : kind === 'u8' ? HEAPU8 : HEAPF32;
        Module.outputBytes += count * heap.BYTES_PER_ELEMENT;
        if (Module.outputBytes > 768 * 1024 * 1024) throw new Error('Converted FBX exceeds the 768 MiB output budget.');
        return heap.slice(ptr / heap.BYTES_PER_ELEMENT, ptr / heap.BYTES_PER_ELEMENT + count);
    };
});
EM_JS(void, fail, (const char *text), { Module.error = UTF8ToString(text); });
EM_JS(void, bridge_warn, (const char *text), { Module.result.warnings.push(UTF8ToString(text)); });
EM_JS(void, emit_node, (const char *name, int parent, int bone, const double *trs), {
    Module.result.nodes.push({ name: UTF8ToString(name), parent, bone: !!bone,
        trs: Array.from(HEAPF64.subarray(trs / 8, trs / 8 + 10)) });
});
EM_JS(void, emit_material, (const char *name, double r, double g, double b, const char *filename, const void *content, size_t size, int textured, const double *uv), {
    Module.result.materials.push({ name: UTF8ToString(name), color: [r,g,b],
        textured: !!textured, filename: UTF8ToString(filename), content: Module.copy(content, size, 'u8'),
        uv: Array.from(HEAPF64.subarray(uv / 8, uv / 8 + 12)) });
});
EM_JS(void, emit_mesh, (int node, size_t count, const float *p, const float *n, const float *uv, const uint32_t *ids, const float *weights, const uint32_t *materials, const uint32_t *bones, const float *inverse, size_t num_bones), {
    Module.result.meshes.push({ node, position: Module.copy(p, count*3), normal: Module.copy(n, count*3),
        uv: Module.copy(uv, count*2), skinIndex: Module.copy(ids, num_bones ? count*4 : 0, 'u32'),
        skinWeight: Module.copy(weights, num_bones ? count*4 : 0), materials: Module.copy(materials, count/3, 'u32'),
        bones: Module.copy(bones, num_bones, 'u32'), inverse: Module.copy(inverse, num_bones*12) });
});
EM_JS(void, emit_clip, (const char *name, double duration), {
    Module.result.clips.push({ name: UTF8ToString(name), duration, tracks: [] });
});
EM_JS(void, emit_track, (int node, int type, size_t count, const float *times, const float *values), {
    Module.result.clips[Module.result.clips.length-1].tracks.push({ node, type,
        times: Module.copy(times, count), values: Module.copy(values, count*(type===1?4:3)) });
});
static void error_out(ufbx_error *error) { char text[1024]; ufbx_format_error(text, sizeof(text), error); fail(text); }
static void *alloc(size_t count, size_t size) {
    if (count > 200000000 || size > SIZE_MAX / (count ? count : 1)) return NULL;
    return calloc(count ? count : 1, size);
}
static int export_mesh(ufbx_node *node) {
    ufbx_mesh *m = node->mesh;
    if (!m || !m->num_triangles) return 1;
    if (m->num_triangles > 10000000) { fail("Mesh exceeds the 10 million triangle conversion limit."); return 0; }
    ufbx_skin_deformer *skin = m->skin_deformers.count ? m->skin_deformers.data[0] : NULL;
    if (m->skin_deformers.count > 1) bridge_warn("Multiple skin deformers: only the first is displayed.");
    if (m->blend_deformers.count) bridge_warn("Legacy FBX blend shapes are not yet displayed.");
    if (skin && skin->skinning_method != UFBX_SKINNING_METHOD_LINEAR && skin->skinning_method != UFBX_SKINNING_METHOD_RIGID)
        bridge_warn("Dual quaternion skinning is approximated with linear skinning.");
    if (skin && skin->max_weights_per_vertex > 4) bridge_warn("Skin weights use the strongest four influences per vertex, normalized.");
    size_t count = m->num_triangles*3, nb = skin ? skin->clusters.count + 1 : 0;
    float *p=alloc(count*3,4), *n=alloc(count*3,4), *uv=alloc(count*2,4), *w=alloc(skin?count*4:0,4), *inv=alloc(nb*12,4);
    uint32_t *ids=alloc(skin?count*4:0,4), *mats=alloc(count/3,4), *bones=alloc(nb,4), *tri=alloc(m->max_face_triangles*3,4);
    int ok=0;
    if (!p||!n||!uv||!w||!inv||!ids||!mats||!bones||!tri) {fail("Not enough memory for mesh conversion.");goto done;}
    if (skin) {
        for (size_t i=0;i<skin->clusters.count;i++) {
            ufbx_skin_cluster *c=skin->clusters.data[i];bones[i]=c->bone_node->typed_id;
            for(int k=0;k<12;k++)inv[i*12+k]=(float)c->geometry_to_bone.v[k];
        }
        // Unweighted vertices follow the mesh node, not an unrelated skeleton bone.
        bones[nb-1]=node->typed_id;inv[(nb-1)*12]=inv[(nb-1)*12+4]=inv[(nb-1)*12+8]=1;
    }
    size_t out=0;
    for(size_t f=0;f<m->faces.count;f++){
        ufbx_face face=m->faces.data[f];if(face.num_indices<3)continue;
        uint32_t nt=ufbx_triangulate_face(tri,m->max_face_triangles*3,m,face);
        uint32_t material=UINT32_MAX;
        if(m->face_material.count){uint32_t mi=m->face_material.data[f];if(mi<node->materials.count)material=node->materials.data[mi]->typed_id;}
        for(size_t t=0;t<nt;t++){
            mats[out/3]=material;
            for(size_t k=0;k<3;k++,out++){
                uint32_t ix=tri[t*3+k];ufbx_vec3 pos=ufbx_get_vertex_vec3(&m->vertex_position,ix);
                ufbx_vec3 normal=ufbx_get_vertex_vec3(&m->vertex_normal,ix);
                ufbx_vec2 tex={0};if(m->vertex_uv.exists)tex=ufbx_get_vertex_vec2(&m->vertex_uv,ix);
                for(int c=0;c<3;c++){p[out*3+c]=(float)pos.v[c];n[out*3+c]=(float)normal.v[c];}
                uv[out*2]=(float)tex.x;uv[out*2+1]=(float)tex.y;
                if(skin){uint32_t vi=m->vertex_indices.data[ix];ufbx_skin_vertex sv=skin->vertices.data[vi];double total=0;
                    for(uint32_t c=0;c<sv.num_weights&&c<4;c++){ufbx_skin_weight sw=skin->weights.data[sv.weight_begin+c];ids[out*4+c]=sw.cluster_index;w[out*4+c]=(float)sw.weight;total+=sw.weight;}
                    if(total>0){for(int c=0;c<4;c++)w[out*4+c]/=(float)total;}else{ids[out*4]=(uint32_t)(nb-1);w[out*4]=1;}
                }
            }
        }
    }
    emit_mesh(node->typed_id,out,p,n,uv,ids,w,mats,bones,inv,nb);ok=1;
 done:free(p);free(n);free(uv);free(w);free(inv);free(ids);free(mats);free(bones);free(tri);return ok;
}
EMSCRIPTEN_KEEPALIVE int convert(const void *data, size_t length) {
    begin_result();ufbx_load_opts opts={0};ufbx_error error={0};
    opts.load_external_files=false;opts.generate_missing_normals=true;
    opts.geometry_transform_handling=UFBX_GEOMETRY_TRANSFORM_HANDLING_HELPER_NODES;
    opts.inherit_mode_handling=UFBX_INHERIT_MODE_HANDLING_COMPENSATE;
    opts.target_axes=ufbx_axes_right_handed_y_up;
    opts.temp_allocator.memory_limit=512*1024*1024;opts.result_allocator.memory_limit=768*1024*1024;
    ufbx_scene *scene=ufbx_load_memory(data,length,&opts,&error);if(!scene){error_out(&error);return 0;}
    int ok=0;
    if(scene->nodes.count>100000){fail("Scene exceeds the 100,000 node conversion limit.");goto done;}
    for(size_t i=0;i<scene->metadata.warnings.count;i++)bridge_warn(scene->metadata.warnings.data[i].description.data);
    for(size_t i=0;i<scene->nodes.count;i++){
        ufbx_node *node=scene->nodes.data[i];ufbx_transform t=node->local_transform;
        double trs[10]={t.translation.x,t.translation.y,t.translation.z,t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w,t.scale.x,t.scale.y,t.scale.z};
        emit_node(node->name.data,node->parent?(int)node->parent->typed_id:-1,node->bone!=NULL,trs);
    }
    for(size_t i=0;i<scene->materials.count;i++){
        ufbx_material *m=scene->materials.data[i];ufbx_material_map *map=&m->fbx.diffuse_color;ufbx_vec3 color=map->value_vec3;
        if(!map->has_value)color=(ufbx_vec3){{0.6,0.65,0.7}};
        ufbx_texture *tex=map->texture;ufbx_blob content={0};const char *filename="";ufbx_matrix uv=ufbx_identity_matrix;
        if(tex){if(tex->type!=UFBX_TEXTURE_FILE)bridge_warn("Layered or procedural textures are approximated using their first file texture.");
            if(tex->file_textures.count)tex=tex->file_textures.data[0];
            filename=tex->relative_filename.length?tex->relative_filename.data:tex->filename.data;content=tex->content;
            if(!content.size&&tex->video)content=tex->video->content;
            uv=tex->uv_to_texture;
        }
        emit_material(m->name.data,color.x,color.y,color.z,filename,content.data,content.size,map->texture!=NULL,uv.v);
    }
    for(size_t i=0;i<scene->nodes.count;i++)if(!export_mesh(scene->nodes.data[i]))goto done;
    for(size_t i=0;i<scene->anim_stacks.count;i++){
        ufbx_anim_stack *a=scene->anim_stacks.data[i];ufbx_bake_opts bo={0};bo.trim_start_time=true;bo.resample_rate=120;bo.minimum_sample_rate=120;
        bo.temp_allocator.memory_limit=512*1024*1024;bo.result_allocator.memory_limit=512*1024*1024;
        ufbx_baked_anim *b=ufbx_bake_anim(scene,a->anim,&bo,&error);if(!b){error_out(&error);goto done;}
        emit_clip(a->name.data,b->playback_duration);
        for(size_t j=0;j<b->nodes.count;j++){
            ufbx_baked_node *bn=&b->nodes.data[j];
            for(int type=0;type<3;type++){
                size_t count=type==0?bn->translation_keys.count:type==1?bn->rotation_keys.count:bn->scale_keys.count;
                int width=type==1?4:3;float *times=alloc(count,4),*values=alloc(count*width,4);
                if(!times||!values){free(times);free(values);ufbx_free_baked_anim(b);fail("Not enough memory for animation conversion.");goto done;}
                for(size_t k=0;k<count;k++){
                    double time;const double *value;
                    if(type==1){time=bn->rotation_keys.data[k].time;value=bn->rotation_keys.data[k].value.v;}
                    else{ufbx_baked_vec3 *v=type==0?&bn->translation_keys.data[k]:&bn->scale_keys.data[k];time=v->time;value=v->value.v;}
                    times[k]=(float)time;for(int c=0;c<width;c++)values[k*width+c]=(float)value[c];
                }
                if(count)emit_track(bn->typed_id,type,count,times,values);free(times);free(values);
            }
        }
        ufbx_free_baked_anim(b);
    }
    ok=1;
 done:ufbx_free_scene(scene);return ok;
}
