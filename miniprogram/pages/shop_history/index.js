const app = getApp()
const api = require('../../utils/request.js')

Page({
  data: {
    list: []
  },

  onLoad: function () {
    this.fetchData()
  },

  onPullDownRefresh() {
      this.fetchData(() => wx.stopPullDownRefresh());
  },

  fetchData(cb) {
    const familyInfo = app.globalData.familyInfo;
    const openid = app.globalData.openid;
    
    if (!familyInfo || !openid) return;

    api.get('/redemption/list', { 
        familyId: familyInfo._id,
        openid: openid
    }).then(res => {
        if (cb) cb();
        if (res.result.code === 0) {
            const list = res.result.data.map(item => {
                const d = new Date(item.create_time);
                item.createTimeStr = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()<10?'0'+d.getMinutes():d.getMinutes()}`;
                
                // 状态翻译
                switch(item.status) {
                    case 'pending': item.statusText = '待确认'; break;
                    case 'approved': item.statusText = '已发放'; break;
                    case 'rejected': item.statusText = '已拒绝'; break;
                    default: item.statusText = item.status;
                }
                return item;
            });
            this.setData({ list });
        }
    }).catch(() => {
        if (cb) cb();
    });
  }
})