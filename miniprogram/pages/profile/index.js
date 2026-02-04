const app = getApp()
const api = require('../../utils/request.js')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    hasFamily: false,
    family: null,
    member: null,
    members: [],
    
    // 弹窗控制
    showCreateModal: false,
    showJoinModal: false,
    inputFamilyName: '',
    inputInviteCode: ''
  },

  onLoad: function () {
    this.checkLoginStatus()
  },

  onShow: function() {
      // 每次显示页面时，重新拉取最新数据（同步积分）
      if (this.data.hasFamily) {
          this.fetchFamilyInfo()
      }
  },

  checkLoginStatus() {
    // 优先检查本地是否有 openid
    if (app.globalData.openid) {
        this.fetchFamilyInfo();
    } else {
        // 无 openid 则先登录
        api.login().then(res => {
            console.log('Login success', res.openid);
            this.fetchFamilyInfo();
        }).catch(err => {
            console.error('Login failed', err);
        });
    }
  },

  fetchFamilyInfo() {
    wx.showLoading({ title: '加载中' })
    api.get('/family/info').then(res => {
        wx.hideLoading()
        const { code, data } = res.result
        if (code === 0) {
          if (data.hasFamily) {
            this.setData({
              hasFamily: true,
              family: data.family,
              member: data.member
            })
            this.fetchMembers(data.family._id)
          } else {
            this.setData({ hasFamily: false })
          }
        }
    }).catch(err => {
        wx.hideLoading()
        console.error(err)
    })
  },

  fetchMembers(familyId) {
    api.get('/family/members', { familyId }).then(res => {
        if (res.result.code === 0) {
          this.setData({ members: res.result.data })
        }
    })
  },

  onChooseAvatar(e) {
      const { avatarUrl } = e.detail;
      this.uploadAvatar(avatarUrl);
  },

  onNicknameChange(e) {
      const nickName = e.detail.value;
      this.updateUserInfo(nickName, this.data.member.avatarUrl);
  },

  uploadAvatar(tempFilePath) {
      wx.showLoading({ title: '上传中' });
      const apiBaseUrl = app.globalData.apiBaseUrl;
      
      wx.uploadFile({
          url: `${apiBaseUrl}/upload`,
          filePath: tempFilePath,
          name: 'file',
          success: (res) => {
              wx.hideLoading();
              const data = JSON.parse(res.data);
              if (data.code === 0) {
                  const avatarUrl = data.data.url;
                  this.updateUserInfo(this.data.member.nickName, avatarUrl);
              } else {
                  wx.showToast({ title: '上传失败', icon: 'none' });
              }
          },
          fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '网络错误', icon: 'none' });
          }
      });
  },

  updateUserInfo(nickName, avatarUrl) {
      const openid = app.globalData.openid;
      api.post('/user/update', {
          openid,
          nickName,
          avatarUrl
      }).then(res => {
          if (res.result.code === 0) {
              wx.showToast({ title: '更新成功' });
              this.fetchFamilyInfo(); // 刷新数据
          }
      });
  },

  getUserProfile(e) {
    wx.getUserProfile({
      desc: '用于完善会员资料', 
      success: (res) => {
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
        
        const type = e.currentTarget.dataset.type
        if (type === 'create') {
          this.setData({ showCreateModal: true })
        } else if (type === 'join') {
          this.setData({ showJoinModal: true })
        }
      }
    })
  },

  onInputFamilyName(e) { this.setData({ inputFamilyName: e.detail.value }) },
  onInputInviteCode(e) { this.setData({ inputInviteCode: e.detail.value }) },

  closeModal() {
    this.setData({ showCreateModal: false, showJoinModal: false })
  },

  confirmCreate() {
    if (!this.data.inputFamilyName) return wx.showToast({ title: '请输入家庭名称', icon: 'none' })
    
    wx.showLoading({ title: '创建中' })
    api.post('/family/create', {
        familyName: this.data.inputFamilyName,
        nickName: this.data.userInfo.nickName,
        avatarUrl: this.data.userInfo.avatarUrl
    }).then(res => {
        wx.hideLoading()
        if (res.result.code === 0) {
          wx.showToast({ title: '创建成功' })
          this.closeModal()
          this.fetchFamilyInfo()
        } else {
          wx.showToast({ title: '创建失败', icon: 'none' })
        }
    })
  },

  confirmJoin() {
    if (!this.data.inputInviteCode) return wx.showToast({ title: '请输入邀请码', icon: 'none' })

    wx.showLoading({ title: '加入中' })
    api.post('/family/join', {
        inviteCode: this.data.inputInviteCode.toUpperCase(),
        nickName: this.data.userInfo.nickName,
        avatarUrl: this.data.userInfo.avatarUrl
    }).then(res => {
        wx.hideLoading()
        if (res.result.code === 0) {
          wx.showToast({ title: '加入成功' })
          this.closeModal()
          this.fetchFamilyInfo()
        } else {
          wx.showToast({ title: res.result.msg || '加入失败', icon: 'none' })
        }
    })
  },

  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.family.invite_code,
      success: () => {
        wx.showToast({ title: '复制成功' })
      }
    })
  }
})