// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 生成随机6位邀请码
function generateInviteCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ---------------------- 业务逻辑 Handlers ----------------------

async function handleUserUpdate(data, openid) {
  const { nickName, avatarUrl } = data;
  try {
    const memberRes = await db.collection('members').where({ openid }).get();
    if (memberRes.data.length > 0) {
      const memberId = memberRes.data[0]._id;
      await db.collection('members').doc(memberId).update({
        data: {
          nickName,
          avatarUrl
        }
      });
      return { code: 0, msg: '更新成功' };
    } else {
      return { code: -1, msg: '用户未找到' };
    }
  } catch (e) {
    return { code: -1, msg: '更新失败', error: e.toString() };
  }
}

async function handleLogin(data, openid) {
  // 云开发不需要 code 换 session，直接返回 openid 即可
  return {
    openid: openid,
    session_key: 'cloud_session_key' // 云开发模式下 session_key 通常用不到，或者无法直接获取
  };
}

async function handleFamilyCreate(data, openid) {
  const { familyName, nickName, avatarUrl } = data;
  const inviteCode = generateInviteCode();
  const createTime = db.serverDate();

  try {
    const familyRes = await db.collection('families').add({
      data: {
        name: familyName,
        creator_openid: openid,
        invite_code: inviteCode,
        create_time: createTime
      }
    });
    const familyId = familyRes._id;

    await db.collection('members').add({
      data: {
        family_id: familyId,
        openid: openid,
        nickName: nickName || '管理员',
        avatarUrl: avatarUrl || '',
        role: 'admin',
        join_time: createTime
      }
    });

    // 预置默认奖励
    const defaultRewards = [
      { name: '看电视 (30分钟)', points: 50, stock: 999, image: '' },
      { name: '玩游戏 (30分钟)', points: 100, stock: 999, image: '' },
      { name: '现金兑换 (10元)', points: 1000, stock: 999, image: '' }
    ];

    const rewardPromises = defaultRewards.map(reward => {
      return db.collection('rewards').add({
        data: {
          family_id: familyId,
          name: reward.name,
          points: reward.points,
          image: reward.image,
          stock: reward.stock,
          create_time: createTime
        }
      });
    });

    await Promise.all(rewardPromises);

    return { code: 0, msg: '创建成功', data: { familyId, inviteCode } };
  } catch (e) {
    return { code: -1, msg: '创建失败', error: e.toString() };
  }
}

async function handleFamilyJoin(data, openid) {
  const { inviteCode, nickName, avatarUrl } = data;
  
  try {
    const familyRes = await db.collection('families').where({ invite_code: inviteCode }).get();
    if (familyRes.data.length === 0) return { code: -1, msg: '邀请码无效' };

    const family = familyRes.data[0];
    const memberCheck = await db.collection('members').where({ openid: openid, family_id: family._id }).get();
    
    if (memberCheck.data.length > 0) {
      return { code: 0, msg: '已在家庭中', data: { familyId: family._id } };
    }

    await db.collection('members').add({
      data: {
        family_id: family._id,
        openid: openid,
        nickName: nickName || '新成员',
        avatarUrl: avatarUrl || '',
        role: 'member',
        join_time: db.serverDate()
      }
    });
    return { code: 0, msg: '加入成功', data: { familyId: family._id } };
  } catch (e) {
    return { code: -1, msg: '加入失败', error: e.toString() };
  }
}

async function handleFamilyInfo(data, openid) {
  // 注意：如果是前端直接调用云函数，openid 已经在 context 里了。
  // 如果是 query 参数传进来的 openid，优先使用 context 里的（如果是查自己）。
  // 这里逻辑保持原样：根据 openid 查。
  const targetOpenid = data.openid || openid; 

  try {
    const memberRes = await db.collection('members').where({ openid: targetOpenid }).get();
    if (memberRes.data.length === 0) return { code: 0, data: { hasFamily: false } };

    const memberInfo = memberRes.data[0];
    const familyRes = await db.collection('families').doc(memberInfo.family_id).get();
    
    return {
      code: 0,
      data: {
        hasFamily: true,
        family: familyRes.data,
        member: memberInfo
      }
    };
  } catch (e) {
    return { code: -1, msg: '获取失败', error: e.toString() };
  }
}

async function handleFamilyMembers(data) {
  const { familyId } = data;
  try {
    const result = await db.collection('members').where({ family_id: familyId }).get();
    return { code: 0, data: result.data };
  } catch (e) {
    return { code: -1, msg: '获取失败', error: e.toString() };
  }
}

async function handleTaskCreate(data, openid) {
  // data 包含 title, desc, points, assignee_openid, family_id, deadline
  // 移除 $url 字段
  let { $url, userInfo, ...taskData } = data; 
  
  // 兼容性处理：确保 family_id 存在
  if (taskData.familyId && !taskData.family_id) {
    taskData.family_id = taskData.familyId;
    delete taskData.familyId;
  }

  try {
    const result = await db.collection('tasks').add({
      data: {
        ...taskData,
        creator_openid: openid,
        status: 'pending',
        create_time: db.serverDate()
      }
    });
    return { code: 0, data: result };
  } catch (e) {
    return { code: -1, msg: '创建失败', error: e.toString() };
  }
}

async function handleTaskList(data, openid) {
  const { familyId, filterType } = data;
  let condition = { family_id: familyId };

  if (filterType === 'my_pending') {
    condition.assignee_openid = openid;
    condition.status = 'pending';
  } else if (filterType === 'overdue') {
    condition.status = 'pending';
    condition.deadline = _.lt(new Date().getTime());
  }
  
  // 修复：确保 family_id 字段匹配数据库中的 familyId (云开发不需要像之前 mock 那样特殊处理)
  // 但要注意前端传参名是 familyId 还是 family_id。Express 代码里处理了。
  // 这里假设前端传的是 familyId
  
  try {
    const result = await db.collection('tasks').where(condition).orderBy('deadline', 'asc').get();
    return { code: 0, data: result.data };
  } catch (e) {
    return { code: -1, msg: '获取失败', error: e.toString() };
  }
}

async function handleTaskComplete(data, openid) {
  const { taskId, proofs } = data;
  try {
    const taskRes = await db.collection('tasks').doc(taskId).get();
    if (!taskRes.data) return { code: -1, msg: '任务不存在' };
    
    const task = taskRes.data;
    if (task.status === 'completed') return { code: 0, msg: '已完成' };
    if (task.status === 'pending_approval') return { code: 0, msg: '审核中' };

    const memberRes = await db.collection('members').where({ openid: openid, family_id: task.family_id }).get();
    if (memberRes.data.length === 0) return { code: -1, msg: '成员不存在' };
    const member = memberRes.data[0];

    if (member.role === 'admin') {
      const rewardPoints = parseInt(task.reward_points || 10, 10);
      
      await db.collection('tasks').doc(taskId).update({
        data: {
          status: 'completed',
          complete_time: db.serverDate(),
          completer_openid: openid,
          proofs: proofs || []
        }
      });

      const currentPoints = parseInt(member.points || 0, 10);
      const currentTotal = parseInt(member.total_points || 0, 10);
      await db.collection('members').doc(member._id).update({
        data: {
          points: currentPoints + rewardPoints,
          total_points: currentTotal + rewardPoints
        }
      });

      return { code: 0, msg: '已完成，积分+'+rewardPoints, data: { status: 'completed' } };

    } else {
      await db.collection('tasks').doc(taskId).update({
        data: {
          status: 'pending_approval',
          submit_time: db.serverDate(),
          completer_openid: openid,
          proofs: proofs || []
        }
      });
      return { code: 0, msg: '已提交，等待管理员确认', data: { status: 'pending_approval' } };
    }
  } catch (e) {
    return { code: -1, msg: '失败', error: e.toString() };
  }
}

async function handleTaskApprove(data, openid) {
  const { taskId } = data;
  try {
    const taskRes = await db.collection('tasks').doc(taskId).get();
    if (!taskRes.data) return { code: -1, msg: '任务不存在' };
    const task = taskRes.data;

    if (task.status !== 'pending_approval') return { code: -1, msg: '任务状态不正确' };

    const adminRes = await db.collection('members').where({ openid: openid, family_id: task.family_id }).get();
    if (adminRes.data.length === 0 || adminRes.data[0].role !== 'admin') {
      return { code: -1, msg: '无权限' };
    }

    const rewardPoints = parseInt(task.reward_points || 10, 10);
    const completerOpenid = task.completer_openid || task.assignee_openid;
    
    const memberRes = await db.collection('members').where({ openid: completerOpenid, family_id: task.family_id }).get();
    if (memberRes.data.length > 0) {
      const member = memberRes.data[0];
      const currentPoints = parseInt(member.points || 0, 10);
      const currentTotal = parseInt(member.total_points || 0, 10);
      
      await db.collection('members').doc(member._id).update({
        data: {
          points: currentPoints + rewardPoints,
          total_points: currentTotal + rewardPoints
        }
      });
    }

    await db.collection('tasks').doc(taskId).update({
      data: {
        status: 'completed',
        complete_time: db.serverDate(),
        approver_openid: openid
      }
    });

    return { code: 0, msg: '审核通过' };
  } catch (e) {
    return { code: -1, msg: '审核失败', error: e.toString() };
  }
}

async function handleRankList(data) {
  const { familyId } = data;
  try {
    const result = await db.collection('members')
      .where({ family_id: familyId })
      .orderBy('total_points', 'desc')
      .get();
      
    return { code: 0, data: result.data };
  } catch (e) {
    return { code: -1, msg: '获取排行榜失败', error: e.toString() };
  }
}

async function handleTaskDelete(data) {
  const { taskId } = data;
  try {
    await db.collection('tasks').doc(taskId).remove();
    return { code: 0, msg: 'Success' };
  } catch (e) {
    return { code: -1, msg: '失败', error: e.toString() };
  }
}

async function handleRewardList(data) {
  const { familyId } = data;
  try {
    const condition = {};
    if (familyId) condition.family_id = familyId;

    const result = await db.collection('rewards').where(condition).get();
    return { code: 0, data: result.data };
  } catch (e) {
    return { code: -1, msg: '获取商品失败', error: e.toString() };
  }
}

async function handleRewardCreate(data) {
  const { familyId, name, points, image, stock } = data;
  try {
    await db.collection('rewards').add({
      data: {
        family_id: familyId,
        name,
        points: parseInt(points),
        image: image || '',
        stock: parseInt(stock) || 999,
        create_time: db.serverDate()
      }
    });
    return { code: 0, msg: '上架成功' };
  } catch (e) {
    return { code: -1, msg: '上架失败', error: e.toString() };
  }
}

async function handleRewardRedeem(data, openid) {
  const { rewardId, familyId } = data;
  try {
    const rewardRes = await db.collection('rewards').doc(rewardId).get();
    if (!rewardRes.data) return { code: -1, msg: '商品不存在' };
    const reward = rewardRes.data;

    if (reward.stock <= 0) return { code: -1, msg: '库存不足' };

    const memberRes = await db.collection('members').where({ openid, family_id: familyId }).get();
    if (memberRes.data.length === 0) return { code: -1, msg: '用户不存在' };
    
    const member = memberRes.data[0];
    const currentPoints = parseInt(member.points || 0);
    const cost = parseInt(reward.points);

    if (currentPoints < cost) {
      return { code: -1, msg: `积分不足，还差 ${cost - currentPoints} 分` };
    }

    await db.collection('members').doc(member._id).update({
      data: {
        points: currentPoints - cost
      }
    });

    await db.collection('rewards').doc(rewardId).update({
      data: {
        stock: reward.stock - 1
      }
    });

    await db.collection('redemptions').add({
      data: {
        family_id: familyId,
        openid,
        reward_id: rewardId,
        reward_name: reward.name,
        cost,
        status: 'approved',
        create_time: db.serverDate()
      }
    });

    return { code: 0, msg: '兑换成功' };
  } catch (e) {
    return { code: -1, msg: '兑换失败', error: e.toString() };
  }
}

async function handleRedemptionList(data, openid) {
  const { familyId, openid: queryOpenid } = data;
  try {
    const condition = { family_id: familyId };
    // 如果 queryOpenid 存在（比如管理员查某人），用它；否则用当前用户 openid
    if (queryOpenid) condition.openid = queryOpenid;
    else condition.openid = openid; // 默认查自己？需确认业务逻辑。这里假设不传 openid 查所有人？
    // Express 代码逻辑：if (openid) condition.openid = openid;
    // 这里的 openid 是 query 参数。
    
    const result = await db.collection('redemptions')
      .where(condition)
      .orderBy('create_time', 'desc')
      .get();
    return { code: 0, data: result.data };
  } catch (e) {
    return { code: -1, msg: '获取记录失败', error: e.toString() };
  }
}

async function handleTaskCopy(data, openid) {
  const { familyId } = data;
  try {
    // 1. 计算昨天的时间范围
    const now = new Date();
    // 昨天的开始：今天零点减去24小时
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const yesterdayEnd = todayStart - 1;

    // 2. 查询昨天截止的任务
    const tasksRes = await db.collection('tasks')
      .where({
        family_id: familyId,
        deadline: _.gte(yesterdayStart).and(_.lte(yesterdayEnd))
      })
      .get();

    const tasks = tasksRes.data;
    if (tasks.length === 0) {
      return { code: 0, msg: '昨天没有任务可复制' };
    }

    // 3. 批量创建新任务
    const createPromises = tasks.map(task => {
      // 计算新的截止时间：原截止时间 + 24小时
      const newDeadline = task.deadline + 24 * 60 * 60 * 1000;
      
      return db.collection('tasks').add({
        data: {
          family_id: familyId,
          title: task.title,
          desc: task.desc || '',
          type: task.type,
          assignee_openid: task.assignee_openid,
          assignee_name: task.assignee_name,
          assignee_avatar: task.assignee_avatar,
          deadline: newDeadline,
          priority: task.priority,
          reward_points: task.reward_points,
          creator_openid: openid, // 复制者作为创建者
          status: 'pending',
          create_time: db.serverDate()
        }
      });
    });

    await Promise.all(createPromises);

    return { code: 0, msg: `成功复制 ${tasks.length} 个任务` };
  } catch (e) {
    return { code: -1, msg: '复制失败', error: e.toString() };
  }
}


// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { $url, ...data } = event;

  // 路由分发
  switch ($url) {
    case '/api/user/update': return await handleUserUpdate(data, openid);
    case '/api/login': return await handleLogin(data, openid);
    case '/api/family/create': return await handleFamilyCreate(data, openid);
    case '/api/family/join': return await handleFamilyJoin(data, openid);
    case '/api/family/info': return await handleFamilyInfo(data, openid);
    case '/api/family/members': return await handleFamilyMembers(data);
    case '/api/task/create': return await handleTaskCreate(data, openid);
    case '/api/task/list': return await handleTaskList(data, openid);
    case '/api/task/complete': return await handleTaskComplete(data, openid);
    case '/api/task/approve': return await handleTaskApprove(data, openid);
    case '/api/task/delete': return await handleTaskDelete(data);
    case '/api/rank/list': return await handleRankList(data);
    case '/api/reward/list': return await handleRewardList(data);
    case '/api/reward/create': return await handleRewardCreate(data);
    case '/api/reward/redeem': return await handleRewardRedeem(data, openid);
    case '/api/redemption/list': return await handleRedemptionList(data, openid);
    case '/api/task/copy': return await handleTaskCopy(data, openid);
    default:
      return { code: -1, msg: '未找到路由: ' + $url };
  }
};
