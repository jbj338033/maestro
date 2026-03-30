/**
 * timeout-protected stdin reader
 * reads JSON from stdin with a timeout guard
 */
export function readStdin(timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(data ? JSON.parse(data) : null);
      } catch {
        resolve(null);
      }
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    process.stdin.resume();
  });
}
