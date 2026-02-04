const app = getApp()
const api = require('../../utils/request.js')

Page({
  data: {
    rankingList: [],
    myRank: null
  },

  onShow: function () {
    this.fetchRanking()
  },

  fetchRanking() {
    const familyInfo = app.globalData.familyInfo
    if (!familyInfo) {
      // 尝试重新获取或提示
      this.checkFamilyStatus()
      return
    }

    wx.showLoading({ title: '加载中' })
    api.get('/rank/list', { familyId: familyInfo._id }).then(res => {
        wx.hideLoading()
        if (res.result.code === 0) {
          const list = res.result.data
          this.setData({ rankingList: list })
        }
    }).catch(() => wx.hideLoading())
  },

  checkFamilyStatus() {
    api.get('/family/info').then(res => {
      const { data } = res.result
      if (data && data.hasFamily) {
        app.globalData.familyInfo = data.family
        this.fetchRanking()
      } else {
        wx.showToast({ title: '请先加入家庭', icon: 'none' })
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1500)
      }
    })
  }
})