const app = getApp()
const api = require('../../utils/request.js')

Page({
  data: {
    myPoints: 0,
    goodsList: [],
    
    // 上架表单
    showAddModal: false,
    inputName: '',
    inputPoints: '',
    inputStock: ''
  },

  onShow: function () {
    this.fetchData()
  },
  
  onPullDownRefresh() {
      this.fetchData(() => wx.stopPullDownRefresh());
  },

  fetchData(cb) {
    const familyInfo = app.globalData.familyInfo
    if (!familyInfo) {
        api.get('/family/info').then(res => {
            if (res.result.data && res.result.data.hasFamily) {
                app.globalData.familyInfo = res.result.data.family;
                this.setData({ 
                    myPoints: res.result.data.member.points || 0 
                });
                this.fetchGoods(res.result.data.family._id, cb);
            }
        });
    } else {
        // 更新积分
        api.get('/family/info').then(res => {
             if (res.result.data && res.result.data.member) {
                 this.setData({ myPoints: res.result.data.member.points || 0 });
             }
        });
        this.fetchGoods(familyInfo._id, cb);
    }
  },

  fetchGoods(familyId, cb) {
    api.get('/reward/list', { familyId }).then(res => {
        if (cb) cb();
        if (res.result.code === 0) {
          this.setData({ goodsList: res.result.data })
        }
    })
  },

  // 上架相关
  showAddModal() { this.setData({ showAddModal: true }) },
  closeModal() { this.setData({ showAddModal: false }) },
  onInputName(e) { this.setData({ inputName: e.detail.value }) },
  onInputPoints(e) { this.setData({ inputPoints: e.detail.value }) },
  onInputStock(e) { this.setData({ inputStock: e.detail.value }) },

  confirmAdd() {
      if (!this.data.inputName || !this.data.inputPoints) {
          return wx.showToast({ title: '请填写完整', icon: 'none' });
      }
      
      wx.showLoading({ title: '上架中' });
      const familyId = app.globalData.familyInfo ? app.globalData.familyInfo._id : '';
      
      api.post('/reward/create', {
          familyId,
          name: this.data.inputName,
          points: this.data.inputPoints,
          stock: this.data.inputStock || 999
      }).then(res => {
          wx.hideLoading();
          if (res.result.code === 0) {
              wx.showToast({ title: '上架成功' });
              this.closeModal();
              this.fetchGoods(familyId);
          } else {
              wx.showToast({ title: '上架失败', icon: 'none' });
          }
      });
  },

  // 兑换相关
  redeemGoods(e) {
      const item = e.currentTarget.dataset.item;
      if (this.data.myPoints < item.points) {
          return wx.showToast({ title: '积分不足', icon: 'none' });
      }
      
      wx.showModal({
          title: '确认兑换',
          content: `确定消耗 ${item.points} 积分兑换 "${item.name}" 吗？`,
          success: (res) => {
              if (res.confirm) {
                  this.doRedeem(item._id);
              }
          }
      });
  },

  doRedeem(rewardId) {
      wx.showLoading({ title: '兑换中' });
      const openid = app.globalData.openid || wx.getStorageSync('openid');
      const familyId = app.globalData.familyInfo._id;

      api.post('/reward/redeem', {
          openid,
          familyId,
          rewardId
      }).then(res => {
          wx.hideLoading();
          if (res.result.code === 0) {
              wx.showToast({ title: '兑换成功' });
              this.fetchData(); // 刷新积分和库存
          } else {
              wx.showToast({ title: res.result.msg || '兑换失败', icon: 'none' });
          }
      });
  },
  
  showHistory() {
      wx.navigateTo({ url: '/pages/shop_history/index' });
  }
})