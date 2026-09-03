// ==UserScript==
// @name         NB Crack
// @namespace    https://github.com/langningchen
// @version      0.0.1
// @description  Crack NB Chemical and NB Physics virtual experiment
// @author       langningchen
// @match        https://hx.nobook.com/*
// @match        https://wl.nobook.com/*
// @icon         https://www.nobook.com/favicon.ico
// @grant        none
// ==/UserScript==

(() => {
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        return originalFetch.call(this, url, options).then(response => {
            return response.clone().json().then(data => {
                if (url.indexOf('/v1/resource/info') != -1) {
                    data.data.vip = 0;
                    data.data.app_resource_vip = 0;
                    data.data.channel_vip = 2;
                }
                if (url.indexOf('libs/chem/allEquipmentMessage.json') != -1 || url.indexOf('libs/chem/assets/totalEquipmentMessage.json') != -1) {
                    for (const c of data) {
                        for (const e of c.equipments) {
                            e.isFreeEq = true;
                        }
                    }
                }
                if (url.indexOf('assets/get_scene_tool.json') != -1) {
                    for (const c of data.modules) {
                        for (const e of c.list) {
                            e.isLock = false;
                        }
                    }
                }
                return new Response(
                    JSON.stringify(data),
                    {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    }
                );
            });
        });
    };
})();