const app = getApp()
const api = require('../../utils/request.js')

Page({
  data: {
    hasFamily: false,
    members: [],
    
    // 表单数据
    title: '',
    desc: '',
    types: ['家务', '学习', '采购', '纪念日', '其他'],
    typeIndex: 0,
    
    // 快捷选项
    quickOptions: ['洗碗', '扫地', '倒垃圾', '做作业', '背单词', '买菜', '交电费', '结婚纪念日'],
    
    assigneeIndex: 0,
    
    priorities: [
      { name: '高', value: 'high', color: 'red' },
      { name: '中', value: 'medium', color: 'orange' },
      { name: '低', value: 'low', color: 'green' }
    ],
    priority: 'medium',
    
    date: '',
    time: '12:00'
  },

  onShow: function () {
    this.checkFamilyStatus()
  },

  checkFamilyStatus() {
    api.get('/family/info').then(res => {
      const { data } = res.result
      if (data && data.hasFamily) {
        this.setData({ hasFamily: true })
        this.fetchMembers(data.family._id)
        
        // 设置默认日期为今天
        const now = new Date()
        this.setData({
          date: `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`
        })
      } else {
        this.setData({ hasFamily: false })
        wx.showModal({
          title: '提示',
          content: '请先创建或加入家庭',
          showCancel: false,
          success: () => {
            wx.switchTab({ url: '/pages/profile/index' })
          }
        })
      }
    })
  },

  fetchMembers(familyId) {
    api.get('/family/members', { familyId }).then(res => {
      if (res.result.code === 0) {
        this.setData({ members: res.result.data })
      }
    })
  },

  // 表单变更
  onTitleInput(e) { this.setData({ title: e.detail.value }) },
  onQuickSelect(e) {
      const val = e.currentTarget.dataset.value;
      this.setData({ title: val });
  },
  onDescInput(e) { this.setData({ desc: e.detail.value }) },
  onTypeChange(e) { this.setData({ typeIndex: e.detail.value }) },
  onAssigneeChange(e) { 
      // 修复：currentTarget.dataset.index 获取点击项的索引
      const index = e.currentTarget.dataset.index;
      if (index !== undefined) {
          this.setData({ assigneeIndex: index });
      }
  },
  onDateChange(e) { this.setData({ date: e.detail.value }) },
  onTimeChange(e) { this.setData({ time: e.detail.value }) },
  onPriorityChange(e) { 
      // 修复：确保 value 不为 undefined
      const val = e.currentTarget.dataset.value;
      if (val) {
          this.setData({ priority: val });
      }
  },

  submitTask() {
    if (!this.data.title) return wx.showToast({ title: '请输入任务名称', icon: 'none' })
    if (this.data.members.length === 0) return wx.showToast({ title: '加载成员中...', icon: 'none' })

    const assignee = this.data.members[this.data.assigneeIndex]
    const deadlineStr = `${this.data.date} ${this.data.time}`.replace(/-/g, '/')
    const deadlineTs = new Date(deadlineStr).getTime()

    wx.showLoading({ title: '发布中' })
    
    api.post('/task/create', {
        familyId: assignee.family_id,
        title: this.data.title,
        desc: this.data.desc,
        type: this.data.types[this.data.typeIndex],
        assignee_openid: assignee.openid,
        assignee_name: assignee.nickName, 
        assignee_avatar: assignee.avatarUrl,
        deadline: deadlineTs,
        priority: this.data.priority
    }).then(res => {
        wx.hideLoading()
        if (res.result.code === 0) {
          wx.showToast({ title: '发布成功' })
          this.setData({ title: '', desc: '' })
          
          // 强制刷新上一页数据
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.checkFamilyStatus) {
             prevPage.checkFamilyStatus();
          }

          setTimeout(() => {
            wx.switchTab({ url: '/pages/task_list/index' })
          }, 1500)
        } else {
          wx.showToast({ title: '发布失败', icon: 'none' })
        }
    }).catch(err => {
        wx.hideLoading()
        console.error(err)
    })
  }
})