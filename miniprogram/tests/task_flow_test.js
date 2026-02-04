// tests/task_flow_test.js
// 这是一个模拟测试脚本，用于手动验证或集成测试参考

const request = require('request'); // 假设引入一个 HTTP 客户端库
const baseUrl = 'http://8.152.223.130:3000/api';

async function runTest() {
    console.log('=== 开始全链路测试 ===');

    // 1. 模拟登录
    console.log('1. 模拟登录...');
    // 由于后端 mock 了 login，我们直接用 mock 数据
    const openid = 'test_openid_12345';
    console.log('   OpenID:', openid);

    // 2. 创建家庭
    console.log('2. 创建家庭...');
    const familyRes = await post('/family/create', {
        openid,
        familyName: 'Test Family',
        nickName: 'Tester'
    });
    if (familyRes.code !== 0) throw new Error('创建家庭失败');
    const familyId = familyRes.data.familyId;
    console.log('   FamilyID:', familyId);

    // 3. 发布任务
    console.log('3. 发布任务...');
    const taskRes = await post('/task/create', {
        openid,
        familyId,
        title: '测试任务',
        desc: '这是一个自动化测试任务',
        type: '家务',
        assignee_openid: openid,
        assignee_name: 'Tester',
        deadline: new Date().getTime(),
        priority: 'high'
    });
    if (taskRes.code !== 0) throw new Error('发布任务失败');
    console.log('   Task Created');

    // 4. 查询任务列表 (模拟首页)
    console.log('4. 查询任务列表 (My Pending)...');
    const listRes = await get('/task/list', {
        openid,
        familyId,
        filterType: 'my_pending'
    });
    if (listRes.code !== 0) throw new Error('查询列表失败');
    console.log(`   Found ${listRes.data.length} tasks`);
    
    if (listRes.data.length === 0) {
        throw new Error('❌ 列表为空，任务未显示！');
    } else {
        console.log('✅ 任务显示正常！');
    }

    console.log('=== 测试通过 ===');
}

// 简单的 fetch 封装
async function post(url, data) {
    return fetch(baseUrl + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(r => r.json());
}

async function get(url, params) {
    const qs = new URLSearchParams(params).toString();
    return fetch(baseUrl + url + '?' + qs).then(r => r.json());
}

// 需要在 Node 环境运行，需 polyfill fetch 或使用 node-fetch
// 这里仅作为逻辑展示
