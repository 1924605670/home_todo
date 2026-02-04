const app = getApp()
const util = require('../../utils/util.js')
const api = require('../../utils/request.js')

Page({
  data: {
    currentTab: 0,
    tabs: ['我的待办', '家庭任务', '逾期任务'],
    tasks: [],
    familyId: null,
    userInfo: null
  },

  onShow: function () {
    this.checkFamilyStatus()
  },

  checkFamilyStatus() {
    api.get('/family/info').then(res => {
        const { data } = res.result
        if (data && data.hasFamily) {
          this.setData({ 
            familyId: data.family._id,
            userInfo: data.member
          })
          this.fetchTasks()
        } else {
          wx.showModal({
            title: '提示',
            content: '请先创建或加入家庭',
            showCancel: false,
            success: () => wx.switchTab({ url: '/pages/profile/index' })
          })
        }
    })
  },

  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({ currentTab: index })
    this.fetchTasks()
  },

  fetchTasks() {
    if (!this.data.familyId) return

    let filterType = 'my_pending'
    if (this.data.currentTab === 1) filterType = 'family_all'
    if (this.data.currentTab === 2) filterType = 'overdue'

    wx.showLoading({ title: '加载中' })
    api.get('/task/list', {
          familyId: this.data.familyId,
          filterType: filterType
    }).then(res => {
        wx.hideLoading()
        if (res.result.code === 0) {
          const tasks = res.result.data.map(task => {
            const d = new Date(task.deadline)
            task.deadlineStr = `${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()<10?'0'+d.getMinutes():d.getMinutes()}`
            return task
          })
          
          // 按日期分组
          const taskGroups = this.groupTasksByDate(tasks);
          this.setData({ taskGroups, tasks }) // 保留 tasks 以备不时之需，但主要渲染 taskGroups
        }
    }).catch(() => wx.hideLoading())
  },

  groupTasksByDate(tasks) {
    const groups = {
      overdue: { title: '已逾期', color: 'red', list: [] },
      today: { title: '今天', color: 'blue', list: [] },
      tomorrow: { title: '明天', color: 'orange', list: [] },
      future: { title: '以后', color: 'green', list: [] },
      completed: { title: '已完成', color: 'gray', list: [] }
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
    const dayAfterTomorrowStart = tomorrowStart + 24 * 60 * 60 * 1000;

    tasks.forEach(task => {
      if (task.status === 'completed') {
        groups.completed.list.push(task);
      } else if (task.deadline < now.getTime()) {
        groups.overdue.list.push(task);
      } else if (task.deadline < tomorrowStart) {
        groups.today.list.push(task);
      } else if (task.deadline < dayAfterTomorrowStart) {
        groups.tomorrow.list.push(task);
      } else {
        groups.future.list.push(task);
      }
    });

    // 转为数组并过滤空组
    return Object.values(groups).filter(g => g.list.length > 0);
  },

  showActionSheet(e) {
    const task = e.currentTarget.dataset.task
    const itemList = ['标记完成', '删除任务']
    
    wx.showActionSheet({
      itemList,
      success: res => {
        if (res.tapIndex === 0) {
          this.completeTask(task._id)
        } else if (res.tapIndex === 1) {
          this.deleteTask(task._id)
        }
      }
    })
  },

  completeTask(taskId) {
    api.post('/task/complete', { taskId }).then(res => {
        if (res.result.code === 0) {
          wx.showToast({ title: '已完成' })
          this.fetchTasks()
        }
    })
  },

  deleteTask(taskId) {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: res => {
        if (res.confirm) {
          api.post('/task/delete', { taskId }).then(res => {
              if (res.result.code === 0) {
                wx.showToast({ title: '已删除' })
                this.fetchTasks()
              }
          })
        }
      }
    })
  }
})