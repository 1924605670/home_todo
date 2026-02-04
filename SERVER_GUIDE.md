# 服务器运维指南

## 1. 登录服务器
使用终端（Terminal）或命令行工具登录到您的远程服务器：

```bash
ssh root@8.152.223.130
```
*   **密码**: `112694Wen` (输入时不会显示字符，直接回车即可)

## 2. 查看项目日志
本项目使用 **PM2** 进行进程管理，服务名称为 `family-server`。

### 查看实时日志（最常用）
```bash
pm2 logs family-server
```
*   这会显示最后几行日志，并实时滚动显示新的请求和错误。
*   按 `Ctrl + C` 退出查看。

### 查看特定行数的日志
```bash
# 查看最后 100 行
pm2 logs family-server --lines 100
```

### 查看错误日志
```bash
pm2 logs family-server --err
```

## 3. 其他常用管理命令

*   **查看服务状态**（检查是否在线、CPU/内存占用）：
    ```bash
    pm2 status
    ```
*   **重启服务**（代码更新后通常会自动重启，手动重启用这个）：
    ```bash
    pm2 restart family-server
    ```
*   **停止服务**：
    ```bash
    pm2 stop family-server
    ```
*   **清空日志**（如果日志太多想重新看）：
    ```bash
    pm2 flush
    ```

## 4. 部署目录
项目代码部署在：
```bash
/root/workspace/home_todo
```
后端服务目录：
```bash
/root/workspace/home_todo/server
```
