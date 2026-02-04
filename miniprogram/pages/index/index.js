const app = getApp()
const api = require('../../utils/request.js')

Page({
  data: {
    hasFamily: false,
    myTasks: [],
    statistics: {
      todayCount: 0,
      totalCount: 0,
      completionRate: 0 // 新增：完成率
    },
    greeting: '你好', // 新增：动态问候
    userInfo: {}
  },

  onShow: function () {
    this.updateGreeting()
    this.setData({
      userInfo: getApp().globalData.userInfo || {}
    })
    this.checkFamilyStatus()
  },

  updateGreeting() {
    const hour = new Date().getHours()
    let greeting = '你好'
    if (hour < 6) greeting = '夜深了'
    else if (hour < 9) greeting = '早上好'
    else if (hour < 12) greeting = '上午好'
    else if (hour < 14) greeting = '中午好'
    else if (hour < 18) greeting = '下午好'
    else if (hour < 22) greeting = '晚上好'
    else greeting = '夜深了'
    
    this.setData({ greeting })
  },

  checkFamilyStatus() {
    api.get('/family/info').then(res => {
        const { data } = res.result
        if (data && data.hasFamily) {
          this.setData({ 
              hasFamily: true,
              // 同步用户信息和积分
              'userInfo.points': data.member.points || 0,
              'userInfo.nickName': data.member.nickName,
              'userInfo.avatarUrl': data.member.avatarUrl // 修复：同步头像
          })
          
          // 更新全局数据，方便其他页面使用
          if (data.member) {
              const app = getApp();
              if (app.globalData.userInfo) {
                  app.globalData.userInfo.points = data.member.points || 0;
              }
          }

          this.fetchMyTasks(data.family._id)
        } else {
          this.setData({ hasFamily: false })
        }
    })
  },

  fetchMyTasks(familyId) {
    api.get('/task/list', {
          familyId: familyId,
          filterType: 'my_pending'
    }).then(res => {
        if (res.result.code === 0) {
          const tasks = res.result.data
          // 简单计算完成率 (假设 totalCount 是 10，仅作演示)
          // 实际应从后端获取 totalCount
          const total = 10;
          const completionRate = Math.round(((total - tasks.length) / total) * 100);
          
          this.setData({
            myTasks: tasks.slice(0, 3), 
            'statistics.todayCount': tasks.length,
            'statistics.completionRate': completionRate > 0 ? completionRate : 0
          })
        }
    })
  },

  completeTask(e) {
    const taskId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认完成',
      content: '确定要标记该任务为完成吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' })
          api.post('/task/complete', { taskId }).then(res => {
              wx.hideLoading()
              if (res.result.code === 0) {
                wx.showToast({ title: '已完成' })
                this.checkFamilyStatus() 
              }
          })
        }
      }
    })
  },

  goToRank() {
    wx.navigateTo({ url: '/pages/rank/index' })
  },

  goToShop() {
    wx.navigateTo({ url: '/pages/shop/index' })
  },

  goToCreate() {
    wx.switchTab({ url: '/pages/task_create/index' })
  },
  
  goToList() {
    wx.switchTab({ url: '/pages/task_list/index' })
  }
})