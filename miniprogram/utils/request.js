const app = getApp();

const request = (url, method, data = {}) => {
  return new Promise((resolve, reject) => {
    // 自动带上 openid (如果有)
    const openid = getApp().globalData.openid;
    if (openid) {
      data.openid = openid;
    } else {
        // 如果没有 openid，尝试从 storage 获取一次（防止 globalData 丢失）
        const storageOpenid = wx.getStorageSync('openid');
        if (storageOpenid) {
            getApp().globalData.openid = storageOpenid;
            data.openid = storageOpenid;
        } else {
            // 如果还是没有，可能需要拦截或打印警告
            console.warn('[Request] No openid found, request might fail:', url);
        }
    }

    wx.request({
      url: getApp().globalData.apiBaseUrl + url,
      method: method,
      data: data,
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode === 200) {
          resolve({ result: res.data }); // 保持 result 结构与云开发一致，减少改动
        } else {
          reject(res);
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

const login = () => {
    return new Promise((resolve, reject) => {
        wx.login({
            success: res => {
                if (res.code) {
                    request('/login', 'POST', { code: res.code }).then(resp => {
                        const { openid } = resp.result;
                        getApp().globalData.openid = openid;
                        wx.setStorageSync('openid', openid);
                        resolve(resp.result);
                    }).catch(reject);
                } else {
                    reject('Login failed: ' + res.errMsg);
                }
            },
            fail: reject
        });
    });
};

module.exports = {
  get: (url, data) => request(url, 'GET', data),
  post: (url, data) => request(url, 'POST', data),
  login: login
};