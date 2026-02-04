const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
// 静态资源服务，用于访问上传的图片
app.use('/public', express.static(path.join(__dirname, 'public')));

// Multer 配置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        // 使用时间戳+随机数作为文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

// 微信小程序配置 (请替换为您真实的 AppID 和 Secret)
const WX_APPID = 'YOUR_APPID'; 
const WX_SECRET = 'YOUR_SECRET';

// ---------------------- 文件上传接口 ----------------------
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.json({ code: -1, msg: '没有文件上传' });
    }
    // 返回完整 URL（假设服务器 IP 固定，实际应配置环境变量）
    // const baseUrl = `http://localhost:${PORT}`; 
    // const baseUrl = `http://8.152.223.130:${PORT}`; // 保持和前端配置一致
    // 动态获取 host
    const protocol = req.protocol;
    const host = req.get('host');
    const url = `${protocol}://${host}/public/uploads/${req.file.filename}`;
    
    res.json({ code: 0, data: { url } });
});

// ---------------------- 用户信息更新接口 ----------------------
app.post('/api/user/update', async (req, res) => {
    const { openid, nickName, avatarUrl } = req.body;
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
            res.json({ code: 0, msg: '更新成功' });
        } else {
            res.json({ code: -1, msg: '用户未找到' });
        }
    } catch (e) {
        res.json({ code: -1, msg: '更新失败', error: e.toString() });
    }
});

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
        // 1. 获取任务详情
        const taskRes = await db.collection('tasks').doc(taskId).get();
        if (!taskRes.data) return res.json({ code: -1, msg: '任务不存在' });
        
        const task = taskRes.data;
        if (task.status === 'completed') return res.json({ code: 0, msg: '已完成' });
        if (task.status === 'pending_approval') return res.json({ code: 0, msg: '审核中' });

        // 2. 检查用户角色
        const memberRes = await db.collection('members').where({ openid: openid, family_id: task.family_id }).get();
        if (memberRes.data.length === 0) return res.json({ code: -1, msg: '成员不存在' });
        const member = memberRes.data[0];

        // 3. 逻辑分叉
        if (member.role === 'admin') {
            // 管理员点击：直接完成并加分
            const rewardPoints = parseInt(task.reward_points || 10, 10);
            
            // 更新任务
            await db.collection('tasks').doc(taskId).update({
                data: {
                    status: 'completed',
                    complete_time: db.serverDate(),
                    completer_openid: openid
                }
            });

            // 增加积分
            const currentPoints = parseInt(member.points || 0, 10);
            const currentTotal = parseInt(member.total_points || 0, 10);
            await db.collection('members').doc(member._id).update({
                data: {
                    points: currentPoints + rewardPoints,
                    total_points: currentTotal + rewardPoints
                }
            });

            res.json({ code: 0, msg: '已完成，积分+'+rewardPoints, data: { status: 'completed' } });

        } else {
            // 普通成员点击：进入待审核
            await db.collection('tasks').doc(taskId).update({
                data: {
                    status: 'pending_approval',
                    submit_time: db.serverDate(),
                    completer_openid: openid
                }
            });
            res.json({ code: 0, msg: '已提交，等待管理员确认', data: { status: 'pending_approval' } });
        }
    } catch (e) {
        res.json({ code: -1, msg: '失败', error: e.toString() });
    }
});

// 新增：任务审核通过接口 (管理员调用)
app.post('/api/task/approve', async (req, res) => {
    const { openid, taskId } = req.body;
    try {
        const taskRes = await db.collection('tasks').doc(taskId).get();
        if (!taskRes.data) return res.json({ code: -1, msg: '任务不存在' });
        const task = taskRes.data;

        if (task.status !== 'pending_approval') return res.json({ code: -1, msg: '任务状态不正确' });

        // 确认操作者是管理员
        const adminRes = await db.collection('members').where({ openid: openid, family_id: task.family_id }).get();
        if (adminRes.data.length === 0 || adminRes.data[0].role !== 'admin') {
            return res.json({ code: -1, msg: '无权限' });
        }

        // 给提交者加分
        const rewardPoints = parseInt(task.reward_points || 10, 10);
        const completerOpenid = task.completer_openid || task.assignee_openid; // 优先给提交人，否则给被指派人
        
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

        // 更新任务状态
        await db.collection('tasks').doc(taskId).update({
            data: {
                status: 'completed',
                complete_time: db.serverDate(),
                approver_openid: openid
            }
        });

        res.json({ code: 0, msg: '审核通过' });
    } catch (e) {
        res.json({ code: -1, msg: '审核失败', error: e.toString() });
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

// ---------------------- 积分商城接口 ----------------------

// 1. 获取商品列表
app.get('/api/reward/list', async (req, res) => {
    const { familyId } = req.query;
    try {
        // 暂时返回所有商品，实际应该按 familyId 过滤（如果支持自定义商品）
        // 这里为了演示，假设商品是全局通用的或者已经按 familyId 存储
        // const condition = familyId ? { family_id: familyId } : {}; 
        // 简化版：每个家庭看到同样的预设商品，或者必须传 familyId
        
        const condition = {};
        if (familyId) condition.family_id = familyId;

        const result = await db.collection('rewards').where(condition).get();
        res.json({ code: 0, data: result.data });
    } catch (e) {
        res.json({ code: -1, msg: '获取商品失败', error: e.toString() });
    }
});

// 2. 上架商品 (管理员)
app.post('/api/reward/create', async (req, res) => {
    const { familyId, name, points, image, stock } = req.body;
    try {
        await db.collection('rewards').add({
            data: {
                family_id: familyId,
                name,
                points: parseInt(points),
                image: image || '', // 暂时只存 URL
                stock: parseInt(stock) || 999,
                create_time: db.serverDate()
            }
        });
        res.json({ code: 0, msg: '上架成功' });
    } catch (e) {
        res.json({ code: -1, msg: '上架失败', error: e.toString() });
    }
});

// 3. 兑换商品
app.post('/api/reward/redeem', async (req, res) => {
    const { openid, rewardId, familyId } = req.body;
    try {
        // a. 检查商品是否存在及库存
        const rewardRes = await db.collection('rewards').doc(rewardId).get();
        if (!rewardRes.data) return res.json({ code: -1, msg: '商品不存在' });
        const reward = rewardRes.data;

        if (reward.stock <= 0) return res.json({ code: -1, msg: '库存不足' });

        // b. 检查用户积分是否足够
        const memberRes = await db.collection('members').where({ openid, family_id: familyId }).get();
        if (memberRes.data.length === 0) return res.json({ code: -1, msg: '用户不存在' });
        
        const member = memberRes.data[0];
        const currentPoints = parseInt(member.points || 0);
        const cost = parseInt(reward.points);

        if (currentPoints < cost) {
            return res.json({ code: -1, msg: `积分不足，还差 ${cost - currentPoints} 分` });
        }

        // c. 执行扣除积分 (原子操作需事务，这里简化为分步)
        // 扣积分
        await db.collection('members').doc(member._id).update({
            data: {
                points: currentPoints - cost
            }
        });

        // 扣库存
        await db.collection('rewards').doc(rewardId).update({
            data: {
                stock: reward.stock - 1
            }
        });

        // 写入兑换记录
        await db.collection('redemptions').add({
            data: {
                family_id: familyId,
                openid,
                reward_id: rewardId,
                reward_name: reward.name,
                cost,
                status: 'approved', // 直接发放
                create_time: db.serverDate()
            }
        });

        res.json({ code: 0, msg: '兑换成功' });

    } catch (e) {
        res.json({ code: -1, msg: '兑换失败', error: e.toString() });
    }
});

// 4. 获取兑换记录
app.get('/api/redemption/list', async (req, res) => {
    const { familyId, openid } = req.query;
    try {
        const condition = { family_id: familyId };
        if (openid) condition.openid = openid; // 如果传了 openid，只看自己的

        const result = await db.collection('redemptions')
            .where(condition)
            .orderBy('create_time', 'desc')
            .get();
        res.json({ code: 0, data: result.data });
    } catch (e) {
        res.json({ code: -1, msg: '获取记录失败', error: e.toString() });
    }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});