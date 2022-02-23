if (!globalThis.fetch) {
  const fetch = require('node-fetch')
  globalThis.fetch = fetch;
  globalThis.FormData = fetch.FormData;
  globalThis.Headers = fetch.Headers;
  globalThis.Request = fetch.Request;
  globalThis.Response = fetch.Response;
}
