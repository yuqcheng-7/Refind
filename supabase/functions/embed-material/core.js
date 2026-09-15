export function isServiceAuthorization(authHeader, serviceRoleKey) {
  if (typeof authHeader !== 'string') return false;
  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return false;
  const token = authHeader.slice(prefix.length);
  if (serviceRoleKey && token === serviceRoleKey) return true;
  // Accept legacy service_role JWTs even when the function env uses a rotated secret.
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;
    const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}


export async function updateChunkEmbedding(admin, chunkId, vector) {
  const update = (embedding) => admin
    .from('material_chunks')
    .update({ embedding })
    .eq('id', chunkId);

  const { error: arrayError } = await update(vector);
  if (!arrayError) return;

  const { error: stringError } = await update(JSON.stringify(vector));
  if (stringError) throw stringError;
}
