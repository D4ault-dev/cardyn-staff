export function renderLogin(): string {
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <div class="login-logo-icon">C</div>
          <span class="login-logo-name">Cardyn Staff</span>
        </div>
        <p class="login-sub">员工管理系统</p>
        <form id="login-form" class="login-form">
          <input id="login-user" class="login-input" placeholder="用户名" autocomplete="username" />
          <input id="login-pass" class="login-input" type="password" placeholder="密码" autocomplete="current-password" />
          <div id="login-err" class="login-error"></div>
          <button id="login-btn" class="login-btn" type="submit">登录</button>
        </form>
      </div>
    </div>
  `
}
