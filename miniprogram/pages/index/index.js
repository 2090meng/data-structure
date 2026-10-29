// 小程序端仅作为 web-view 容器，页面本体是仓库根目录的静态网页。
//
// 上线前必须完成两件事：
// 1) 把 WEB_URL 改成已备案的 https 地址（不能是 localhost、内网 IP 或未备案域名）；
// 2) 在「微信公众平台 → 设置 → 业务域名」中添加该域名，并按提示下载校验文件
//    放到域名根目录（例如 https://your.domain/xxxx.txt）。
//    否则 web-view 会白屏并报「业务域名未配置」。
// 注意：个人主体的小程序不支持配置业务域名，也就无法使用 web-view。
const WEB_URL = 'https://example.com/data-structure/';

Page({
  data: {
    url: WEB_URL,
  },
});
