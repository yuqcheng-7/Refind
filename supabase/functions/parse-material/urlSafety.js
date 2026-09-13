const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.google.internal.',
]);

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;

  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 169 && second === 254)
    || (first === 192 && second === 168);
}

function isPrivateIpv6(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === '::1' || host === '::') return true;
  if (/^fe[89ab][0-9a-f]:/.test(host) || /^f[cd][0-9a-f]{2}:/.test(host)) return true;

  const mappedIpv4 = host.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  const mappedHex = host.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!mappedHex) return false;
  const high = Number.parseInt(mappedHex[1], 16);
  const low = Number.parseInt(mappedHex[2], 16);
  return isPrivateIpv4([
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff,
  ].join('.'));
}

export function isBlockedIpAddress(hostname) {
  return isPrivateIpv4(hostname) || isPrivateIpv6(hostname);
}

export function isAllowedPublicUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !METADATA_HOSTS.has(hostname)
      && !isBlockedIpAddress(hostname);
  } catch {
    return false;
  }
}
