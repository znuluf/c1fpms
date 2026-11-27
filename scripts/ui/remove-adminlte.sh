#!/usr/bin/env bash
# Replaces the AdminLTE stylesheet with plain Bootstrap 4 plus src/shared/fpms/shell.less.
# Needs Internet access (run it in the Codespace). Check the screens before committing.
set -euo pipefail
cd "$(dirname "$0")/../../angular"

if ! grep -q 'admin-lte-css-only' angular.json; then
    echo "AdminLTE is already removed."
    exit 0
fi

yarn add bootstrap@4.6.2
yarn remove admin-lte-css-only
sed -i 's#node_modules/admin-lte-css-only/css/adminlte.min.css#node_modules/bootstrap/dist/css/bootstrap.min.css#' angular.json
sed -i "s#^@import './fpms/fpms.less';#@import './fpms/shell.less';\n&#" src/shared/core.less
npx ng build

echo "Done. Check every main screen in both themes, then commit angular.json, package.json, yarn.lock and core.less."
