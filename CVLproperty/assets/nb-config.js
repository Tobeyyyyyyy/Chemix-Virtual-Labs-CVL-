window.__nb_domain = {
  userLoginApi: 'https://passport.nobook.com/v5/login/username',
  passportUrl: 'https://passport.nobook.com',
  baseUrl: 'https://www.nobook.com',
  accountUrl: 'https://account.nobook.com',
  cookieDomain: '.nobook.com',
};

var insert_config = {
  lan: 'en',
  learnGuidId: '180',
  __nb_hide_school: 'true',
  api: {
    checkLoginUrl: '',
    loginOutTUrl: '',
    storageUrl: 'https://storage-backend.nobook.com',
    activateUrl: 'https://activate-offline-backend.nobook.com',
    consoleUrl: 'https://console-v6.nobook.com',
    consolePcUrl: 'https://console-v6.nobook.com',
    passportUrl: 'https://passport.nobook.com',
    accountUrl: 'https://account.nobook.com',
    activePhoneUrl: 'https://activate-offline-front.nobook.com',
    buyVipBase: 'https://active.nobook.com',
    sharePhy: 'https://share-wuli.nobook.com',
    shareChem: 'https://share-huaxue.nobook.com',
    serverTimeHost: 'https://ntongji.nobook.com',
    originUrl: 'https://hx.nobook.com',
    nbHelp: 'https://help.nobook.com/nobook',
    perfectUrl: 'https://active-window.nobook.com',
    wechatAppletUrl: 'https://s.nobook.com/index.html#/',
    phywebexam: 'https://phywebexam.nobook.com',
    chemwebexam: 'https://chemwebexam.nobook.com',
    u5: {
      baseUrl: 'https://passport.nobook.com',
      list: {
        paymentUrl: 'payment/#/',
      }
    },
  }
};

window.__nb_config = insert_config;


window.__nb_sensors = {
  enabled: 'true',
  showlog: '',
  tenantName: 'nobook_en',
  project: 'nobook_prod'
};

window.__nb_howxm = {
  appId: '201b3c2b-4562-4e47-9c2e-5feb07db6109'
};

window.__nb_sentry = {
  enabled: ''
};

window.__nb_resolution = '';

window.__nb_hideNBElement = 'true';
window.__nb_hideUserPopver = '';
window.__nb_hideLoginRegister = '';
window.__nb_vipEndTip = '';
window.__nb_noWebTip = '';
window.__nb_loginEndTip = 'Please login before using the experiment.';
window.__nb_resource_sort_type = '';
window.__nb_show_language_btn = '1';

try {
  const arr = Object.keys(window).filter((item) => /^__nb_/.test(item));
  arr.forEach(key => {
    if (/^(true|false)$/ig.test(window[key])) {
      window[key] = /(true)/ig.test(window[key]);
    }
  });
  var debugConf = localStorage.getItem('DEBUG_MODEL_CONFIG');
  if (debugConf) {
    var debugConfObj = JSON.parse(debugConf);
    Object.keys(debugConfObj).map(function(key) {
      window[key] = debugConfObj[key];
    });
    alert('注意,已启用自定义环境变量,原有环境变量会被覆盖!');
  }
} catch (err) { }
window.__vip_rate_limit_config = {
      VIP_RATE_LIMIT_URL: 'https://storage-backend.nobook.com/experiment/v1/Play'
};
