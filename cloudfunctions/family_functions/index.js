// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()
const _ = db.command

// 生成随机6位邀请码
function generateInviteCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  switch (action) {
    case 'create':
      return await createFamily(openid, data)
    case 'join':
      return await joinFamily(openid, data)
    case 'get_info':
      return await getUserFamilyInfo(openid)
    case 'get_members':
      return await getFamilyMembers(data.familyId)
    default:
      return {
        code: -1,
        msg: '未知的操作类型'
      }
  }
}

async function createFamily(openid, data) {
  const { familyName, nickName, avatarUrl } = data
  const inviteCode = generateInviteCode()
  const createTime = db.serverDate()

  try {
    // 1. 创建家庭
    const familyRes = await db.collection('families').add({
      data: {
        name: familyName,
        creator_openid: openid,
        invite_code: inviteCode,
        create_time: createTime
      }
    })

    const familyId = familyRes._id

    // 2. 添加创建者为管理员
    await db.collection('members').add({
      data: {
        family_id: familyId,
        openid: openid,
        nickName: nickName || '管理员',
        avatarUrl: avatarUrl || '',
        role: 'admin', // admin | member
        join_time: createTime
      }
    })

    return {
      code: 0,
      msg: '创建成功',
      data: {
        familyId,
        inviteCode
      }
    }
  } catch (e) {
    console.error(e)
    return {
      code: -1,
      msg: '创建失败',
      error: e
    }
  }
}

async function joinFamily(openid, data) {
  const { inviteCode, nickName, avatarUrl } = data
  
  try {
    // 1. 查找家庭
    const familyRes = await db.collection('families').where({
      invite_code: inviteCode
    }).get()

    if (familyRes.data.length === 0) {
      return {
        code: -1,
        msg: '邀请码无效'
      }
    }

    const family = familyRes.data[0]
    
    // 2. 检查是否已加入
    const memberCheck = await db.collection('members').where({
      openid: openid,
      family_id: family._id
    }).get()

    if (memberCheck.data.length > 0) {
      return {
        code: 0,
        msg: '已在家庭中',
        data: {
          familyId: family._id
        }
      }
    }

    // 3. 加入家庭
    await db.collection('members').add({
      data: {
        family_id: family._id,
        openid: openid,
        nickName: nickName || '新成员',
        avatarUrl: avatarUrl || '',
        role: 'member',
        join_time: db.serverDate()
      }
    })

    return {
      code: 0,
      msg: '加入成功',
      data: {
        familyId: family._id
      }
    }

  } catch (e) {
    console.error(e)
    return {
      code: -1,
      msg: '加入失败',
      error: e
    }
  }
}

async function getUserFamilyInfo(openid) {
  try {
    // 1. 查找用户所在的家庭关联信息
    const memberRes = await db.collection('members').where({
      openid: openid
    }).get()

    if (memberRes.data.length === 0) {
      return {
        code: 0,
        data: {
          hasFamily: false
        }
      }
    }

    const memberInfo = memberRes.data[0]
    
    // 2. 查找家庭详情
    const familyRes = await db.collection('families').doc(memberInfo.family_id).get()

    return {
      code: 0,
      data: {
        hasFamily: true,
        family: familyRes.data,
        member: memberInfo
      }
    }
  } catch (e) {
    console.error(e)
    return {
      code: -1,
      msg: '获取信息失败',
      error: e
    }
  }
}

async function getFamilyMembers(familyId) {
  try {
    const res = await db.collection('members').where({
      family_id: familyId
    }).get()

    return {
      code: 0,
      data: res.data
    }
  } catch (e) {
    return {
      code: -1,
      msg: '获取成员列表失败',
      error: e
    }
  }
}