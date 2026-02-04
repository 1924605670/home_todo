const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// 微信小程序配置 (请替换为您真实的 AppID 和 Secret)
const WX_APPID = 'YOUR_APPID'; 
const WX_SECRET = 'YOUR_SECRET';

// ---------------------- 登录接口 ----------------------
app.post('/api/login', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    // 模拟登录（为了方便演示，如果没code，直接生成一个模拟openid）
    // 实际生产环境这里必须报错
    return res.json({
        openid: 'mock_openid_' + Math.floor(Math.random() * 10000),
        session_key: 'mock_session_key'
    });
  }

  try {
    // 真实环境调用：
    // const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;
    // const response = await axios.get(url);
    // res.json(response.data);
    
    // 演示环境 mock：
    res.json({
      openid: 'test_openid_12345', // 固定一个 openid 方便测试
      session_key: 'test_session_key'
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---------------------- 家庭管理接口 ----------------------
// 复用之前的逻辑，只是改成 Express 路由风格

// 生成随机6位邀请码
function generateInviteCode() {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

app.post('/api/family/create', async (req, res) => {
    const { openid, familyName, nickName, avatarUrl } = req.body;
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

        res.json({ code: 0, msg: '创建成功', data: { familyId, inviteCode } });
    } catch (e) {
        res.json({ code: -1, msg: '创建失败', error: e.toString() });
    }
});

app.post('/api/family/join', async (req, res) => {
    const { openid, inviteCode, nickName, avatarUrl } = req.body;
    
    try {
        const familyRes = await db.collection('families').where({ invite_code: inviteCode }).get();
        if (familyRes.data.length === 0) return res.json({ code: -1, msg: '邀请码无效' });

        const family = familyRes.data[0];
        const memberCheck = await db.collection('members').where({ openid: openid, family_id: family._id }).get();
        
        if (memberCheck.data.length > 0) {
            return res.json({ code: 0, msg: '已在家庭中', data: { familyId: family._id } });
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
        res.json({ code: 0, msg: '加入成功', data: { familyId: family._id } });
    } catch (e) {
        res.json({ code: -1, msg: '加入失败', error: e.toString() });
    }
});

app.get('/api/family/info', async (req, res) => {
    const { openid } = req.query;
    try {
        const memberRes = await db.collection('members').where({ openid: openid }).get();
        if (memberRes.data.length === 0) return res.json({ code: 0, data: { hasFamily: false } });

        const memberInfo = memberRes.data[0];
        const familyRes = await db.collection('families').doc(memberInfo.family_id).get();
        
        res.json({
            code: 0,
            data: {
                hasFamily: true,
                family: familyRes.data,
                member: memberInfo
            }
        });
    } catch (e) {
        res.json({ code: -1, msg: '获取失败', error: e.toString() });
    }
});

app.get('/api/family/members', async (req, res) => {
    const { familyId } = req.query;
    try {
        const result = await db.collection('members').where({ family_id: familyId }).get();
        res.json({ code: 0, data: result.data });
    } catch (e) {
        res.json({ code: -1, msg: '获取失败', error: e.toString() });
    }
});

// ---------------------- 任务接口 ----------------------
app.post('/api/task/create', async (req, res) => {
    const { openid, ...data } = req.body;
    try {
        const result = await db.collection('tasks').add({
            data: {
                ...data,
                creator_openid: openid,
                status: 'pending',
                create_time: db.serverDate()
            }
        });
        res.json({ code: 0, data: result });
    } catch (e) {
        res.json({ code: -1, msg: '创建失败', error: e.toString() });
    }
});

app.get('/api/task/list', async (req, res) => {
    const { openid, familyId, filterType } = req.query;
    let condition = { family_id: familyId };

    if (filterType === 'my_pending') {
        condition.assignee_openid = openid;
        condition.status = 'pending';
    } else if (filterType === 'overdue') {
        condition.status = 'pending';
        condition.deadline = db.command.lt(new Date().getTime());
    }
    // 修复：确保 family_id 字段匹配数据库中的 familyId
    if (condition.family_id) {
        condition.familyId = condition.family_id;
        delete condition.family_id;
    }

    try {
        console.log(`[GET /api/task/list] Query:`, req.query);
        console.log(`[GET /api/task/list] Condition:`, JSON.stringify(condition));
        
        const result = await db.collection('tasks').where(condition).orderBy('deadline', 'asc').get();
        console.log(`[GET /api/task/list] Found ${result.data.length} tasks`);
        res.json({ code: 0, data: result.data });
    } catch (e) {
        console.error(`[GET /api/task/list] Error:`, e);
        res.json({ code: -1, msg: '获取失败', error: e.toString() });
    }
});

app.post('/api/task/complete', async (req, res) => {
    const { openid, taskId } = req.body;
    try {
        // 1. 获取任务详情，确认积分值
        const taskRes = await db.collection('tasks').doc(taskId).get();
        if (!taskRes.data) return res.json({ code: -1, msg: '任务不存在' });
        
        const task = taskRes.data;
        if (task.status === 'completed') return res.json({ code: 0, msg: '已完成' });

        const rewardPoints = task.reward_points || 10; // 默认10分

        // 2. 更新任务状态
        await db.collection('tasks').doc(taskId).update({
            data: {
                status: 'completed',
                complete_time: db.serverDate(),
                completer_openid: openid
            }
        });

        // 3. 增加用户积分
        // 注意：这里需要原子操作或事务，简易版先分步执行
        const memberRes = await db.collection('members').where({ openid: openid, family_id: task.family_id }).get();
        if (memberRes.data.length > 0) {
            const member = memberRes.data[0];
            const newPoints = (member.points || 0) + rewardPoints;
            const newTotal = (member.total_points || 0) + rewardPoints;
            
            await db.collection('members').doc(member._id).update({
                data: {
                    points: newPoints,
                    total_points: newTotal
                }
            });
        }

        res.json({ code: 0, msg: 'Success', data: { earnedPoints: rewardPoints } });
    } catch (e) {
        res.json({ code: -1, msg: '失败', error: e.toString() });
    }
});

app.get('/api/rank/list', async (req, res) => {
    const { familyId } = req.query;
    try {
        // 按总积分降序排列
        const result = await db.collection('members')
            .where({ family_id: familyId })
            .orderBy('total_points', 'desc')
            .get();
            
        res.json({ code: 0, data: result.data });
    } catch (e) {
        res.json({ code: -1, msg: '获取排行榜失败', error: e.toString() });
    }
});

app.post('/api/task/delete', async (req, res) => {
    const { taskId } = req.body;
    try {
        await db.collection('tasks').doc(taskId).remove();
        res.json({ code: 0, msg: 'Success' });
    } catch (e) {
        res.json({ code: -1, msg: '失败', error: e.toString() });
    }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});