(() => {
  const SOURCE_PAGE = 'refind-app';
  const SOURCE_EXT = 'refind-extension';

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_PAGE) return;

    const requestId = data.requestId;
    const type = data.type;

    if (type === 'REFIND_PING') {
      chrome.runtime.sendMessage({ type: 'PING' }, (resp) => {
        const err = chrome.runtime.lastError?.message;
        window.postMessage(
          {
            source: SOURCE_EXT,
            type: 'REFIND_PONG',
            requestId,
            ok: !err && Boolean(resp?.ok),
            version: resp?.version || '',
            error: err || '',
          },
          '*',
        );
      });
      return;
    }

    if (type === 'REFIND_GET_SESSION') {
      chrome.runtime.sendMessage(
        { type: 'GET_PLATFORM_SESSION', platform: data.platform },
        (resp) => {
          const err = chrome.runtime.lastError?.message;
          window.postMessage(
            {
              source: SOURCE_EXT,
              type: 'REFIND_SESSION',
              requestId,
              ok: !err && Boolean(resp?.ok),
              session: resp?.session || null,
              error: err || resp?.error || '',
            },
            '*',
          );
        },
      );
      return;
    }

    if (type === 'REFIND_OPEN_PLATFORM') {
      chrome.runtime.sendMessage(
        { type: 'OPEN_PLATFORM_LOGIN', platform: data.platform },
        (resp) => {
          const err = chrome.runtime.lastError?.message;
          window.postMessage(
            {
              source: SOURCE_EXT,
              type: 'REFIND_OPENED',
              requestId,
              ok: !err && Boolean(resp?.ok),
              error: err || resp?.error || '',
            },
            '*',
          );
        },
      );
    }
  });
})();
