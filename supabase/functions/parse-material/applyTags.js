export async function replaceMaterialTagRelations(admin, { userId, materialId, tagNames }) {
  const names = Array.isArray(tagNames) ? tagNames : [];
  const tagIds = [];
  for (const name of names) {
    const { data: existing, error: lookupError } = await admin
      .from('material_tags')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.id) {
      tagIds.push(existing.id);
      continue;
    }
    const { data: created, error: createError } = await admin
      .from('material_tags')
      .insert({ user_id: userId, name })
      .select('id')
      .single();
    if (createError) throw createError;
    tagIds.push(created.id);
  }

  const { error: clearError } = await admin
    .from('material_tag_relations')
    .delete()
    .eq('material_id', materialId);
  if (clearError) throw clearError;

  if (!tagIds.length) return;
  const { error: linkError } = await admin.from('material_tag_relations').insert(
    tagIds.map((tag_id) => ({ material_id: materialId, tag_id })),
  );
  if (linkError) throw linkError;
}
