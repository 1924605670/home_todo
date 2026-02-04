const app = getApp()
const api = require('../../utils/request.js')

Page({
  data: {
    hasFamily: false,
    members: [],
    
    // 表单数据
    title: '',
    desc: '',
    types: ['作业', '复习', '阅读', '运动', '兴趣', '其他'],
    typeIndex: 0,
    
    // 快捷选项
    quickOptions: ['语文作业', '数学试卷', '背英语单词', '阅读打卡', '整理错题', '预习新课', '练字', '跳绳'],
    
    // 智能截止时间建议
    deadlineOptions: [],
    
    // 积分奖励
    rewardPoints: 10,
    pointOptions: [10, 20, 30, 50, 100],
    
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
        
        // 初始化智能截止时间
        this.initSmartDeadlines();
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

  initSmartDeadlines() {
      const now = new Date();
      const hour = now.getHours();
      const options = [];
      
      const format = (d) => {
          return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
      };

      const todayStr = format(now);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = format(tomorrow);

      // 逻辑：
      // 1. 如果是上午 (<12)，建议：今天中午(12:00)、今天下班(18:00)、今晚(21:00)
      // 2. 如果是下午 (<18)，建议：今天下班(18:00)、今晚(21:00)、明天上午(09:00)
      // 3. 如果是晚上 (>=18)，建议：今晚(21:00)、明天上午(09:00)、明天下午(18:00)
      // 4. 如果很晚了 (>21)，建议：明天上午(09:00)、明天中午(12:00)

      if (hour < 12) {
          options.push({ label: '今天中午', date: todayStr, time: '12:00' });
          options.push({ label: '今天下班', date: todayStr, time: '18:00' });
          options.push({ label: '今晚', date: todayStr, time: '21:00' });
      } else if (hour < 18) {
          options.push({ label: '今天下班', date: todayStr, time: '18:00' });
          options.push({ label: '今晚', date: todayStr, time: '21:00' });
          options.push({ label: '明天上午', date: tomorrowStr, time: '09:00' });
      } else if (hour < 21) {
          options.push({ label: '今晚', date: todayStr, time: '21:00' });
          options.push({ label: '明天上午', date: tomorrowStr, time: '09:00' });
          options.push({ label: '明天下午', date: tomorrowStr, time: '18:00' });
      } else {
          options.push({ label: '明天上午', date: tomorrowStr, time: '09:00' });
          options.push({ label: '明天中午', date: tomorrowStr, time: '12:00' });
          options.push({ label: '明天晚上', date: tomorrowStr, time: '21:00' });
      }

      // 默认选中第一个建议
      if (options.length > 0) {
          this.setData({
              deadlineOptions: options,
              date: options[0].date,
              time: options[0].time
          });
      }
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
  onDeadlineSelect(e) {
      const { date, time } = e.currentTarget.dataset;
      this.setData({ date, time });
  },

  onPointChange(e) {
      const val = e.currentTarget.dataset.value;
      this.setData({ rewardPoints: val });
  },

  onTypeSelect(e) {
      const index = e.currentTarget.dataset.index;
      this.setData({ typeIndex: index });
  },

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
        priority: this.data.priority,
        reward_points: this.data.rewardPoints // 提交积分
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