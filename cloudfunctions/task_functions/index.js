// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  switch (action) {
    case 'create':
      return await createTask(openid, data)
    case 'list':
      return await getTaskList(openid, data)
    case 'complete':
      return await completeTask(openid, data)
    case 'delete':
      return await deleteTask(openid, data)
    default:
      return { code: -1, msg: 'Unknown action' }
  }
}

async function createTask(openid, data) {
  try {
    const res = await db.collection('tasks').add({
      data: {
        ...data,
        creator_openid: openid,
        status: 'pending', // pending, completed, overdue
        create_time: db.serverDate()
      }
    })
    return { code: 0, data: res }
  } catch (e) {
    return { code: -1, msg: 'Create failed', error: e }
  }
}

async function getTaskList(openid, data) {
  const { familyId, filterType } = data 
  // filterType: 'my_pending', 'family_all', 'overdue'
  
  let condition = {
    family_id: familyId
  }

  if (filterType === 'my_pending') {
    condition.assignee_openid = openid
    condition.status = 'pending'
  } else if (filterType === 'overdue') {
    condition.status = 'pending'
    condition.deadline = _.lt(new Date().getTime()) // 简单的逾期判断
  }
  // family_all 则不加额外条件，显示所有

  try {
    const res = await db.collection('tasks')
      .where(condition)
      .orderBy('deadline', 'asc')
      .get()
      
    // 这里如果要做更复杂的关联查询（比如把 openid 换成昵称），可以使用 aggregate
    // 为了简单，我们假设前端已经缓存了成员列表，可以在前端做 mapping

    return { code: 0, data: res.data }
  } catch (e) {
    return { code: -1, msg: 'Get list failed', error: e }
  }
}

async function completeTask(openid, data) {
  const { taskId } = data
  try {
    await db.collection('tasks').doc(taskId).update({
      data: {
        status: 'completed',
        complete_time: db.serverDate(),
        completer_openid: openid
      }
    })
    return { code: 0, msg: 'Success' }
  } catch (e) {
    return { code: -1, msg: 'Complete failed', error: e }
  }
}

async function deleteTask(openid, data) {
  const { taskId } = data
  try {
    await db.collection('tasks').doc(taskId).remove()
    return { code: 0, msg: 'Success' }
  } catch (e) {
    return { code: -1, msg: 'Delete failed', error: e }
  }
}