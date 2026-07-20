// Minimal HTML for the PIN gate in front of the real dashboard. Styled to
// roughly match dashboard/index.html's dark theme so it doesn't feel like a
// different app.
export function renderLoginPage(message?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kosha — Enter PIN</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0c0f0d; color: #eef4f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .box { background: #15201a; border: 1px solid #223028; border-radius: 16px; padding: 32px; width: 280px; text-align: center; }
  h1 { font-size: 16px; margin: 0 0 16px; }
  input { width: 100%; padding: 10px; font-size: 20px; text-align: center; letter-spacing: 6px;
    background: #121815; border: 1px solid #223028; border-radius: 8px; color: #eef4f0; box-sizing: border-box; }
  button { margin-top: 14px; width: 100%; padding: 10px; background: #baf23c; color: #10240a;
    border: none; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; }
  .err { color: #ff8a65; font-size: 12px; margin-top: 10px; min-height: 14px; }
</style>
</head>
<body>
  <form class="box" method="POST" action="/dashboard/login">
    <h1>Enter your Kosha PIN</h1>
    <input type="password" name="pin" inputmode="numeric" pattern="\\d{6}" maxlength="6" minlength="6" autofocus required autocomplete="off">
    <button type="submit">Unlock</button>
    <div class="err">${message ?? ""}</div>
  </form>
</body>
</html>`;
}

export function renderMessagePage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kosha</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0c0f0d; color: #eef4f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .box { background: #15201a; border: 1px solid #223028; border-radius: 16px; padding: 32px; max-width: 320px; text-align: center; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  p { color: #7f9086; font-size: 13px; margin: 0; }
</style>
</head>
<body>
  <div class="box"><h1>${title}</h1><p>${body}</p></div>
</body>
</html>`;
}
