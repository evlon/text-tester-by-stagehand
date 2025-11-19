# 自动化测试规则配置使用指南

## 📋 目录

1. [快速开始](#快速开始)
2. [规则语法说明](#规则语法说明)
3. [操作分类详解](#操作分类详解)
4. [实战案例](#实战案例)
5. [最佳实践](#最佳实践)
6. [常见问题](#常见问题)

---

## 🚀 快速开始

### 基本概念

本测试框架使用**自然语言式的规则配置**，每一行代表一个测试步骤，格式为：

```
操作类型~参数1~参数2~...
```

- 使用 `~` 波浪号分隔操作和参数
- 支持中文描述，贴近自然语言
- AI 增强：无法匹配规则时自动使用 AI 理解意图

### 为什么选择 `~` 作为分隔符？

✅ **简洁高效**：单字符，输入快速（Shift + `）  
✅ **视觉清晰**：与文字区分明显  
✅ **无歧义**：无中英文混淆问题  
✅ **兼容性好**：不与正则表达式冲突

### 第一个测试用例

```yaml
1. 打开~https://www.example.com
2. 在搜索框中输入~Playwright
3. 点击~搜索按钮
4. 等待~2000~毫秒
5. 断言包含文本~.results~Playwright
6. 截图~保存为~search-result
```

---

## 📖 规则语法说明

### 参数占位符

在 patterns 中使用 `{参数名}` 表示可变参数：

```yaml
patterns:
  - "在{field}中输入~{value}"
```

匹配示例：`在用户名中输入~admin`
- `field` = 用户名
- `value` = admin

### 选择器类型

框架支持多种选择器：

| 选择器类型 | 示例 | 说明 |
|----------|------|------|
| CSS 选择器 | `#username` | ID 选择器 |
| CSS 选择器 | `.btn-primary` | Class 选择器 |
| CSS 选择器 | `button[type='submit']` | 属性选择器 |
| XPath | `//button[@id='login']` | XPath 表达式 |
| 文本选择器 | `text=登录` | 按文本内容查找 |
| AI 描述 | `登录按钮` | 自然语言描述（AI） |

### 变量系统

在执行过程中可用的变量：

| 变量 | 类型 | 说明 |
|-----|------|------|
| `$page` | Page | 当前活动页面 |
| `$stagehand` | Stagehand | AI 增强引擎 |
| `$context` | Context | 上下文管理器（多标签页） |
| `$title` | string | 当前页面标题 |
| `$url` | string | 当前页面 URL |
| `fs` | Module | Node.js 文件系统 |
| `path` | Module | Node.js 路径处理 |
| `z` | Zod | 数据验证库 |
| `expect` | Chai | 断言库 |

---

## 🎯 操作分类详解

### 1. 页面导航

#### 打开新标签页
```yaml
打开~https://www.example.com
访问~登录页~https://app.example.com/login
```

#### 当前页面跳转
```yaml
当前页面打开~https://www.example.com/about
跳转到~https://www.example.com/contact
```

#### 页面控制
```yaml
返回          # 后退
前进          # 前进
刷新          # 刷新页面
```

---

### 2. 表单操作

#### 输入文本（AI 增强）
```yaml
在用户名中输入~admin
输入~test@example.com~到邮箱字段
```

#### 精确输入（选择器）
```yaml
填充~#username~admin
设置~input[name='email']~为~test@example.com
键入~#search~Playwright  # 逐字输入，模拟真实打字
```

#### 清空输入
```yaml
清空~#username
清除~input[name='email']
```

---

### 3. 点击操作

#### AI 智能点击
```yaml
点击~登录按钮
单击~提交
```

#### 精确点击
```yaml
技术点击~button[type='submit']
定位点击~#login-btn
```

#### 特殊点击
```yaml
双击~.file-item
右键~.context-menu-trigger
悬停~.dropdown-trigger
```

---

### 4. 选择操作

#### 下拉框
```yaml
选择~#country~China
下拉选择~select[name='language']~中文
```

#### 复选框/单选框
```yaml
勾选~#agree-terms
取消勾选~#newsletter
```

---

### 5. 等待操作

#### 时间等待
```yaml
等待~2000~毫秒
暂停~3000~ms
```

#### 元素等待
```yaml
等待元素~.loading-spinner    # 等待元素出现
等待文本~登录成功            # 等待文本出现
等待导航                     # 等待页面加载完成
等待URL~dashboard            # 等待 URL 包含指定内容
```

#### 网络等待
```yaml
等待响应~/api/login         # 等待 API 响应
等待请求~/api/data          # 等待请求发出
```

---

### 6. 断言验证

#### 元素状态断言
```yaml
断言可见~#success-message
断言隐藏~.error-tooltip
断言可用~button[type='submit']
断言禁用~#disabled-input
断言已选中~#terms-checkbox
```

#### 文本断言
```yaml
断言包含文本~.message~成功
断言文本等于~h1~欢迎登录
```

#### 数量断言
```yaml
断言数量~.product-item~10        # 断言有 10 个产品
应该有~3~个~.error-message      # 应该有 3 个错误信息
```

#### URL 和标题断言
```yaml
断言URL包含~dashboard
地址应该包含~success
断言标题~用户中心
标题应该是~Dashboard
```

#### 属性断言
```yaml
断言属性~#link~href~https://example.com
属性应该是~img~src~logo.png
```

---

### 7. 数据提取

#### AI 自由提取
```yaml
摘录~页面上所有产品的名称和价格
提取~用户的个人信息
```

#### 结构化提取（带 Schema）
```yaml
摘录~提取产品列表~z.array(z.object({name: z.string(), price: z.number(), inStock: z.boolean()}))
```

Schema 示例：
```javascript
z.object({
  name: z.string(),           // 字符串
  age: z.number(),            // 数字
  email: z.string().email(),  // 邮箱格式
  tags: z.array(z.string()),  // 字符串数组
  isActive: z.boolean()       // 布尔值
})
```

#### 元素提取
```yaml
获取文本~h1                      # 获取标题文本
获取属性~#link~href              # 获取链接地址
获取值~#username                 # 获取输入框的值
统计~.product-item               # 统计元素数量
```

---

### 8. 截图保存

#### 整页截图
```yaml
截图~保存为~homepage
截屏~保存为~error-page
```

#### 元素截图
```yaml
截取元素~.product-card~保存为~product-detail
```

---

### 9. 多标签页管理

#### 创建和切换
```yaml
新建标签页~https://www.example.com
列出所有标签页
切换到标签页~关于我们
```

#### 查找和关闭
```yaml
查找标签页~Dashboard             # 查找包含 "Dashboard" 的标签页
关闭标签页~设置                  # 关闭包含 "设置" 的标签页
```

---

### 10. 高级操作

#### 键盘操作
```yaml
按键~Enter
按下~Escape
键盘输入~Hello World
```

常用按键：`Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`

#### 滚动操作
```yaml
滚动到~.footer
滚动~底部
滚动~顶部
```

#### 文件操作
```yaml
上传文件~input[type='file']~./test-data/image.png
下载文件~保存为~report.pdf
```

#### 对话框处理
```yaml
接受对话框                       # 点击 "确定"
取消对话框                       # 点击 "取消"
对话框输入~用户名               # prompt 对话框输入
```

#### JavaScript 执行
```yaml
执行JS~window.scrollTo(0, 500)
计算~document.querySelectorAll('.item').length
```

#### AI 代理任务
```yaml
代理~登录系统，找到设置页面，更改语言为中文
智能执行~填写表单并提交，然后验证提交成功
```

---

## 💡 实战案例

### 案例 1：用户登录测试

```yaml
# 测试场景：验证用户登录功能
1. 打开~https://app.example.com/login
2. 等待元素~#login-form
3. 填充~#username~testuser
4. 填充~#password~Test@123
5. 截图~保存为~before-login
6. 技术点击~button[type='submit']
7. 等待URL~dashboard
8. 断言URL包含~dashboard
9. 断言可见~.welcome-message
10. 断言包含文本~.welcome-message~欢迎
11. 截图~保存为~after-login
```

---

### 案例 2：电商购物流程

```yaml
# 测试场景：商品搜索、加购、结算
1. 打开~https://shop.example.com
2. 在搜索框中输入~Laptop
3. 点击~搜索按钮
4. 等待~2000~毫秒
5. 断言数量~.product-item~5
6. 摘录~提取前5个产品的名称和价格~z.array(z.object({name: z.string(), price: z.number()}))
7. 保存JSON~search-results~$result
8. 点击~第一个产品
9. 等待元素~.product-detail
10. 截图~保存为~product-detail
11. 点击~加入购物车
12. 等待文本~已加入购物车
13. 点击~购物车图标
14. 断言数量~.cart-item~1
15. 点击~去结算
16. 断言URL包含~checkout
```

---

### 案例 3：表单验证测试

```yaml
# 测试场景：注册表单的前端验证
1. 打开~https://app.example.com/register
2. 填充~#email~invalid-email
3. 技术点击~button[type='submit']
4. 断言可见~.error-email
5. 断言包含文本~.error-email~邮箱格式不正确
6. 清空~#email
7. 填充~#email~valid@example.com
8. 填充~#password~123
9. 技术点击~button[type='submit']
10. 断言可见~.error-password
11. 断言包含文本~.error-password~密码长度至少8位
12. 清空~#password
13. 填充~#password~Valid@123
14. 填充~#confirm-password~Different@123
15. 技术点击~button[type='submit']
16. 断言包含文本~.error-confirm~两次密码不一致
17. 截图~保存为~validation-errors
```

---

### 案例 4：多标签页操作

```yaml
# 测试场景：在多个标签页中操作
1. 打开~https://www.example.com
2. 新建标签页~https://www.example.com/about
3. 新建标签页~https://www.example.com/contact
4. 列出所有标签页
5. 切换到标签页~About
6. 断言标题~About Us
7. 截图~保存为~about-page
8. 切换到标签页~Contact
9. 在消息框中输入~Hello, this is a test message
10. 点击~发送
11. 关闭标签页~Contact
12. 切换到标签页~Example
13. 断言URL包含~example.com
```

---

### 案例 5：API 响应验证

```yaml
# 测试场景：验证 API 调用和响应
1. 打开~https://app.example.com
2. 点击~加载数据
3. 等待响应~/api/users
4. 摘录~提取页面上的用户列表~z.array(z.object({id: z.number(), name: z.string(), email: z.string()}))
5. 保存JSON~users-data~$result
6. 断言数量~.user-card~10
7. 观察~页面上的所有用户卡片
```

---

### 案例 6：性能测试

```yaml
# 测试场景：页面加载性能测试
1. 打开~https://www.example.com
2. 等待导航
3. 获取性能指标
4. 保存JSON~performance-metrics~$result
5. 脚本~const metrics = $result.result; expect(metrics.loadComplete, '页面加载时间应小于3秒').to.be.lessThan(3000);
6. 截图~保存为~performance-test
```

---

## 🏆 最佳实践

### 1. 选择器优先级

推荐优先级（从高到低）：

1. **测试专用属性**：`data-testid="login-button"`
   ```yaml
   技术点击~[data-testid='login-button']
   ```

2. **ID 选择器**：稳定且唯一
   ```yaml
   填充~#username~admin
   ```

3. **语义化选择器**：可读性强
   ```yaml
   技术点击~button[aria-label='提交表单']
   ```

4. **AI 描述**：灵活但可能不稳定
   ```yaml
   点击~登录按钮
   ```

5. **避免使用**：依赖样式的选择器
   ```yaml
   # ❌ 不推荐
   技术点击~.btn.btn-primary.mt-3
   ```

### 2. 等待策略

**总是在关键操作后添加适当的等待：**

```yaml
# ✅ 推荐
1. 技术点击~button[type='submit']
2. 等待URL~success
3. 断言可见~.success-message

# ❌ 不推荐（可能因页面未加载完成而失败）
1. 技术点击~button[type='submit']
2. 断言可见~.success-message
```

### 3. 断言粒度

**详细的断言更易于定位问题：**

```yaml
# ✅ 推荐：多个小断言
1. 断言URL包含~dashboard
2. 断言可见~.user-profile
3. 断言包含文本~.username~admin
4. 断言数量~.notification~3

# ❌ 不推荐：单一模糊断言
1. 代理~验证页面加载成功
```

### 4. 截图时机

**在关键步骤截图，便于问题追溯：**

```yaml
1. 打开~https://app.example.com
2. 截图~保存为~01-homepage
3. 填充~#username~admin
4. 填充~#password~secret
5. 截图~保存为~02-filled-form
6. 技术点击~button[type='submit']
7. 等待~2000~毫秒
8. 截图~保存为~03-after-submit
```

### 5. 数据驱动测试

**使用 JSON 存储测试数据：**

```yaml
# 准备测试数据
1. 脚本~const testUsers = [{username: 'user1', password: 'pass1'}, {username: 'user2', password: 'pass2'}];
2. 保存JSON~test-users~testUsers

# 后续可以读取使用
1. 读取JSON~test-users
2. 脚本~const user = $result.result[0];
3. 填充~#username~${user.username}
```

### 6. 错误处理

**添加验证步骤，确保前置条件满足：**

```yaml
1. 打开~https://app.example.com/dashboard
2. 等待元素~#user-menu               # 确保已登录
3. 断言可见~#user-menu
4. 技术点击~#user-menu
5. 点击~设置
```

---

## ❓ 常见问题

### Q1: 如何选择 AI 操作还是精确选择器？

**A:** 
- **开发阶段**：使用 AI 操作快速验证流程
- **回归测试**：使用精确选择器确保稳定性
- **动态页面**：AI 操作更灵活
- **静态页面**：精确选择器更快速

### Q2: 元素找不到怎么办？

**A:** 依次尝试：
1. 增加等待时间：`等待元素~.target-element`
2. 滚动到元素：`滚动到~.target-element`
3. 切换到正确的 Frame：`切换到iframe~#content-frame`
4. 使用 AI 定位：`点击~目标按钮描述`
5. 检查元素是否动态加载：`等待~3000~毫秒`

### Q3: 如何调试失败的测试？

**A:**
1. 查看截图：每个步骤后添加截图
2. 添加日志：使用 `脚本~console.log($title, $url)`
3. 放慢执行：增加等待时间
4. 分步执行：注释掉部分步骤，逐步定位

### Q4: 如何提取复杂的嵌套数据？

**A:** 使用 Zod Schema 定义结构：

```yaml
摘录~提取产品列表~z.array(z.object({ 
  name: z.string(), 
  price: z.number(), 
  reviews: z.array(z.object({
    author: z.string(),
    rating: z.number(),
    comment: z.string()
  }))
}))
```

### Q5: 如何处理动态内容？

**A:**
1. 使用灵活的选择器（避免索引）
2. 使用文本匹配：`等待文本~成功`
3. 使用部分匹配：`断言包含文本~.message~操作`
4. 增加重试机制：添加多次检查

### Q6: 如何在测试中使用变量？

**A:** 使用脚本块存储和引用变量：

```yaml
1. 获取文本~.username
2. 脚本~const username = $result.result; 
3. 填充~#search~{username}
```

### Q7: 为什么选择 `~` 而不是其他分隔符？

**A:** 
- ✅ 无中英文混淆（不像 `::` 和 `：：`）
- ✅ 不与正则冲突（不像 `|`）
- ✅ 视觉清晰（不像 `-` 或 `_`）
- ✅ 输入方便（Shift + ` 键）

---

## 📚 参考资源

- [Playwright 官方文档](https://playwright.dev/)
- [Stagehand 文档](https://docs.stagehand.dev/)
- [Zod Schema 文档](https://zod.dev/)
- [Chai 断言库](https://www.chaijs.com/)

---

## 🎓 进阶学习路径

1. **初学者**：掌握基本的页面导航、表单操作、简单断言
2. **进阶**：学习数据提取、多标签页管理、复杂断言
3. **高级**：使用 AI 代理、性能测试、自定义脚本
4. **专家**：编写自定义规则、集成 CI/CD、并发测试

---

**祝测试愉快！ 🚀**

