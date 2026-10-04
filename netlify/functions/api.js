const serverless = require("serverless-http");
const appModule = require("../../dist/src/server.js");

const app =
  appModule.app ||
  appModule.default ||
  appModule.server;

if (!app) {
  throw new Error(
    "Express application was not exported from dist/src/server.js"
  );
}

exports.handler = serverless(app, {
  requestId: true
});
