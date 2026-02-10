const app = getApp()
const util = require('../../utils/util.js')
const api = require('../../utils/request.js')

Page({
  data: {
    currentTab: 0,
    tabs: ['我的待办', '家庭任务', '逾期任务'],
    tasks: [],
    familyId: null,
    userInfo: null,
    
    // 日历相关
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    calendarDays: [],
    selectedDate: '', // 格式 YYYY-MM-DD
    allTasks: [] // 存储当前家庭所有任务，用于日历统计
  },

  onShow: function () {
    this.checkFamilyStatus()
    // 初始化选中今天
    const now = new Date();
    this.setData({
        selectedDate: `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`
    });
    this.generateCalendar(this.data.currentYear, this.data.currentMonth);
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
    
    // 1. 获取当前 tab 的任务列表
    const p1 = api.get('/task/list', {
          familyId: this.data.familyId,
          filterType: filterType
    });

    // 2. 获取家庭所有任务用于日历统计 (仅当 allTasks 为空或需要刷新时)
    // 这里简单起见，每次都拉取 family_all 来计算日历
    const p2 = api.get('/task/list', {
        familyId: this.data.familyId,
        filterType: 'family_all' 
    });

    Promise.all([p1, p2]).then(results => {
        wx.hideLoading()
        const res1 = results[0];
        const res2 = results[1];

        // 处理当前列表数据
        if (res1.result.code === 0) {
          const tasks = this.processTasks(res1.result.data);
          // 如果选中了日期，则在前端再过滤一次
          const filteredTasks = this.filterTasksByDate(tasks, this.data.selectedDate);
          const taskGroups = this.groupTasksByDate(filteredTasks);
          this.setData({ taskGroups, tasks: filteredTasks })
        }

        // 处理日历统计数据
        if (res2.result.code === 0) {
            this.setData({ allTasks: res2.result.data });
            this.updateCalendarStats();
        }

    }).catch(() => wx.hideLoading())
  },

  processTasks(data) {
      return data.map(task => {
        const d = new Date(task.deadline)
        task.deadlineStr = `${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()<10?'0'+d.getMinutes():d.getMinutes()}`
        return task
      })
  },

  filterTasksByDate(tasks, dateStr) {
      if (!dateStr) return tasks;
      // 筛选截止日期是选中日期的任务
      // 注意：这里只比较日期部分
      const target = dateStr.split('-').map(Number); // [2023, 10, 5]
      
      return tasks.filter(task => {
          const d = new Date(task.deadline);
          return d.getFullYear() === target[0] && 
                 (d.getMonth() + 1) === target[1] && 
                 d.getDate() === target[2];
      });
  },

  // 日历逻辑
  prevMonth() {
      let { currentYear, currentMonth } = this.data;
      if (currentMonth === 1) {
          currentYear--;
          currentMonth = 12;
      } else {
          currentMonth--;
      }
      this.setData({ currentYear, currentMonth });
      this.generateCalendar(currentYear, currentMonth);
      this.updateCalendarStats();
  },

  nextMonth() {
      let { currentYear, currentMonth } = this.data;
      if (currentMonth === 12) {
          currentYear++;
          currentMonth = 1;
      } else {
          currentMonth++;
      }
      this.setData({ currentYear, currentMonth });
      this.generateCalendar(currentYear, currentMonth);
      this.updateCalendarStats();
  },

  generateCalendar(year, month) {
      const days = [];
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);
      const daysInMonth = lastDay.getDate();
      const startWeek = firstDay.getDay(); // 0-6

      // 补全上个月
      const prevLastDay = new Date(year, month - 1, 0).getDate();
      for (let i = startWeek - 1; i >= 0; i--) {
          days.push({
              day: prevLastDay - i,
              isCurrentMonth: false,
              dateString: '' // 上个月的日期暂不处理点击
          });
      }

      // 当月天数
      for (let i = 1; i <= daysInMonth; i++) {
          days.push({
              day: i,
              isCurrentMonth: true,
              dateString: `${year}-${month}-${i}`,
              pendingCount: 0,
              completedCount: 0
          });
      }

      // 补全下个月 (凑齐 42 格或 35 格)
      const remaining = 42 - days.length;
      for (let i = 1; i <= remaining; i++) {
          days.push({
              day: i,
              isCurrentMonth: false,
              dateString: ''
          });
      }

      this.setData({ calendarDays: days });
  },

  updateCalendarStats() {
      const { allTasks, calendarDays } = this.data;
      if (!allTasks || allTasks.length === 0) return;

      const newDays = calendarDays.map(day => {
          if (!day.isCurrentMonth) return day;

          // 统计该日期的任务
          const targetDate = day.dateString; // YYYY-M-D
          const [y, m, d] = targetDate.split('-').map(Number);

          let pending = 0;
          let completed = 0;

          allTasks.forEach(task => {
              const taskDate = new Date(task.deadline);
              if (taskDate.getFullYear() === y && 
                  (taskDate.getMonth() + 1) === m && 
                  taskDate.getDate() === d) {
                  
                  if (task.status === 'completed') completed++;
                  else pending++;
              }
          });

          return { ...day, pendingCount: pending, completedCount: completed };
      });

      this.setData({ calendarDays: newDays });
  },

  onDateSelect(e) {
      const date = e.currentTarget.dataset.date;
      if (!date) return;
      
      this.setData({ selectedDate: date });
      this.fetchTasks(); // 重新拉取并过滤
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

  previewProof(e) {
      const { current, urls } = e.currentTarget.dataset;
      wx.previewImage({
          current,
          urls
      });
  },

  onTapApprove(e) {
      const task = e.currentTarget.dataset.task;
      wx.showModal({
          title: '审核确认',
          content: '确认通过该任务吗？',
          confirmText: '通过',
          cancelText: '取消',
          success: (res) => {
              if (res.confirm) {
                  this.approveTask(task._id);
              }
          }
      });
  },

  onTapComplete(e) {
      const task = e.currentTarget.dataset.task;
      wx.showActionSheet({
          itemList: ['上传凭证并完成', '直接完成'],
          success: (res) => {
              if (res.tapIndex === 0) {
                  // 上传凭证
                  this.chooseProofAndComplete(task._id);
              } else if (res.tapIndex === 1) {
                  // 直接完成
                  this.completeTask(task._id);
              }
          }
      });
  },

  showActionSheet(e) {
    const task = e.currentTarget.dataset.task
    let itemList = ['标记完成', '删除任务']
    
    // 如果是管理员且任务待审核，增加选项
    if (this.data.userInfo.role === 'admin' && task.status === 'pending_approval') {
        itemList = ['通过审核', '删除任务']
    } else if (task.status === 'completed' || task.status === 'pending_approval') {
        itemList = ['删除任务']
    } else {
        // 普通任务，点击标记完成时，允许上传证明
        // 这里为了简单，先用 ActionSheet 区分
        itemList = ['直接完成', '上传证明并完成', '删除任务']
    }

    wx.showActionSheet({
      itemList,
      success: res => {
        const tapText = itemList[res.tapIndex];
        if (tapText === '标记完成' || tapText === '直接完成') {
          this.completeTask(task._id)
        } else if (tapText === '上传证明并完成') {
          this.chooseProofAndComplete(task._id)
        } else if (tapText === '通过审核') {
          this.approveTask(task._id)
        } else if (tapText === '删除任务') {
          this.deleteTask(task._id)
        }
      }
    })
  },

  chooseProofAndComplete(taskId) {
      wx.chooseMedia({
          count: 3,
          mediaType: ['image'], // 暂时只支持图片
          sourceType: ['album', 'camera'],
          success: (res) => {
              const tempFiles = res.tempFiles;
              this.uploadProofs(tempFiles, (urls) => {
                  this.completeTask(taskId, urls);
              });
          }
      })
  },

  uploadProofs(files, cb) {
      wx.showLoading({ title: '上传中' });
      const urls = [];
      let completed = 0;

      files.forEach(file => {
          const cloudPath = `proofs/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
          
          wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: file.tempFilePath,
              success: (res) => {
                  urls.push(res.fileID);
              },
              fail: console.error,
              complete: () => {
                  completed++;
                  if (completed === files.length) {
                      wx.hideLoading();
                      cb(urls);
                  }
              }
          });
      });
  },

  approveTask(taskId) {
      api.post('/task/approve', { taskId }).then(res => {
          if (res.result.code === 0) {
              wx.showToast({ title: '已通过' })
              this.fetchTasks()
          } else {
              wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' })
          }
      })
  },

  completeTask(taskId, proofs = []) {
    api.post('/task/complete', { taskId, proofs }).then(res => {
        if (res.result.code === 0) {
          wx.showToast({ title: res.result.msg || '已提交' })
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