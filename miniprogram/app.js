// app.js
App({
  onLaunch: function () {
    // 移除云开发初始化
    // if (!wx.cloud) { ... }

    this.globalData = {
      userInfo: null,
      familyInfo: null,
      memberInfo: null,
      // 自有服务器地址 (本地调试用 localhost，真机调试需换成局域网IP或公网域名)
      apiBaseUrl: 'http://localhost:3000/api', 
      openid: wx.getStorageSync('openid') || null
    };
  }
});