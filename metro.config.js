/**
 * Metro（バンドラ）の設定。
 *
 * Web で expo-sqlite を動かすために WebAssembly を資産として扱えるようにする。
 * 既定では .wasm が解決できず、Web向けのビルドが通らない。
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

// SQLite の Web 実装は SharedArrayBuffer を使うため、
// 開発サーバーからも隔離用のヘッダを返す必要がある
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
