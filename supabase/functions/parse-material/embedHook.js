export function invokeEmbedMaterial({
  fetchFn = fetch,
  logger = console,
  supabaseUrl,
  serviceRoleKey,
  materialId,
}) {
  const embedUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/embed-material`;
  return fetchFn(embedUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ materialId, rebuildChunks: true }),
    })
    .then((response) => {
      if (!response.ok) {
        logger.error(
          'embed-material request failed',
          response.status,
          (response.statusText || '').slice(0, 120),
        );
      }
      return response;
    })
    .catch((error) => {
      logger.error('embed-material request rejected');
      throw error;
    });
}
