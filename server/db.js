const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// 初始化数据文件
if (!fs.existsSync(DB_FILE)) {
  const initialData = {
    families: [],
    members: [],
    tasks: [],
    rewards: [],
    redemptions: []
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

function readDb() {
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  // 确保所有集合都存在
  if (!data.rewards) data.rewards = [];
  if (!data.redemptions) data.redemptions = [];
  return data;
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 模拟简易数据库操作
const db = {
  collection: (name) => {
    return {
      add: async ({ data }) => {
        const dbData = readDb();
        if (!dbData[name]) dbData[name] = []; // 动态创建集合
        const newItem = { _id: Date.now().toString() + Math.random().toString(36).substr(2, 9), ...data };
        dbData[name].push(newItem);
        writeDb(dbData);
        return { _id: newItem._id };
      },
      where: (query) => {
        return {
          get: async () => {
            const dbData = readDb();
            let items = dbData[name];
            // 简单过滤
            items = items.filter(item => {
              for (let key in query) {
                // 如果 query[key] 是 undefined/null，则忽略该条件（或根据业务需求决定）
                // 这里我们假设如果传递了 key 但值为 undefined，说明是无效查询条件，应该忽略还是严格匹配？
                // 之前的逻辑是 strict: if (item[key] !== query[key]) return false;
                // 如果 query[key] 是 undefined, item[key] 是 'xxx', 则 'xxx' !== undefined 为 true, 返回 false.
                // 这会导致 filterType=my_pending 时，如果 familyId 缺失，query.family_id 为 undefined，导致所有数据被过滤。
                
                if (query[key] === undefined) continue; // 忽略 undefined 的查询条件

                if (item[key] !== query[key]) return false;
              }
              return true;
            });
            return { data: items };
          },
          orderBy: (field, order) => { // 链式调用 mock
             return {
                get: async () => {
                    const dbData = readDb();
                    let items = dbData[name];
                    // 过滤
                    items = items.filter(item => {
                        for (let key in query) {
                            if (query[key] && typeof query[key] === 'object' && query[key].operator === 'lt') {
                                // 处理简单的 lt 操作符 mock
                                if (!(item[key] < query[key].val)) return false;
                            } else if (item[key] !== query[key]) {
                                return false;
                            }
                        }
                        return true;
                    });
                    // 排序
                    items.sort((a, b) => {
                        if (order === 'asc') return a[field] - b[field];
                        return b[field] - a[field];
                    });
                    return { data: items };
                }
             }
          }
        };
      },
      doc: (id) => {
        return {
          get: async () => {
             const dbData = readDb();
             const item = dbData[name].find(i => i._id === id);
             return { data: item };
          },
          update: async ({ data }) => {
            const dbData = readDb();
            const index = dbData[name].findIndex(i => i._id === id);
            if (index !== -1) {
              dbData[name][index] = { ...dbData[name][index], ...data };
              writeDb(dbData);
            }
          },
          remove: async () => {
            const dbData = readDb();
            const index = dbData[name].findIndex(i => i._id === id);
            if (index !== -1) {
              dbData[name].splice(index, 1);
              writeDb(dbData);
            }
          }
        };
      }
    };
  },
  serverDate: () => new Date().getTime(),
  command: {
      lt: (val) => ({ operator: 'lt', val })
  }
};

module.exports = db;