// Preload for offline regression runs. Tests may replace fetch with an explicit
// fixture transport; restoring it restores this deny-by-default implementation.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
const forbidden = () => { throw new Error('Network access forbidden in Astra collector fixture tests'); };
globalThis.fetch = forbidden;
net.connect = forbidden;
net.createConnection = forbidden;
tls.connect = forbidden;
http.request = forbidden;
http.get = forbidden;
https.request = forbidden;
https.get = forbidden;
