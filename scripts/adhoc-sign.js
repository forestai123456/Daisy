const { execSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function (context) {
  const appName = context.packager.appInfo.productName;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  console.log(`\n[adhoc-sign] ad-hoc signing ${appPath}`);
  execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: "inherit" });
  console.log("[adhoc-sign] done");
};
