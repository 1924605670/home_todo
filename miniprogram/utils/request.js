const app = getApp();

const request = (url, method, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: {
        $url: '/api' + url,
        ...data
      },
      success: (res) => {
        // 云函数直接返回业务数据 { code: 0, data: ... }
        if (res.result && (res.result.code === 0 || res.result.openid)) {
          // 兼容 login 接口直接返回 { openid: ... }
          resolve({ result: res.result }); 
        } else {
          reject(res.result || res);
        }
      },
      fail: (err) => {
        console.error('[Cloud] Call function failed', err);
        reject(err);
      }
    });
  });
};

const login = () => {
    return new Promise((resolve, reject) => {
        // 云开发登录无需 wx.login 获取 code
        request('/login', 'POST', {}).then(resp => {
            const { openid } = resp.result;
            if (openid) {
                getApp().globalData.openid = openid;
                wx.setStorageSync('openid', openid);
                resolve(resp.result);
            } else {
                reject('Login failed: No openid returned');
            }
        }).catch(reject);
    });
};

module.exports = {
  get: (url, data) => request(url, 'GET', data),
  post: (url, data) => request(url, 'POST', data),
  login: login
};