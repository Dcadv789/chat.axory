/**
 * Extrai o authorization code da resposta do `FB.login` (SDK JavaScript da Meta).
 *
 * Mesmo pedindo `response_type: 'code'` com `override_default_response_type`,
 * o SDK nem sempre devolve o code em `authResponse.code`: quando a sessão volta
 * como `status: 'connected'`, ele vem DENTRO do `signedRequest`, no formato
 * `assinatura.payloadBase64Url`, junto do `oauth_token`.
 *
 * Ler apenas `authResponse.code` fazia um login BEM-SUCEDIDO ser tratado como
 * falha: o usuário autorizava normalmente e a tela dizia que não deu certo.
 *
 * A assinatura NÃO é validada aqui de propósito — quem valida é a Meta, na troca
 * do code por token, no backend. Um code forjado falha lá, e duplicar a
 * validação HMAC no navegador exigiria expor o app secret.
 */
export function extractFbAuthCode(response: any): string | null {
  const direct = response?.authResponse?.code;
  if (typeof direct === 'string' && direct) return direct;

  const signed = response?.authResponse?.signedRequest;
  if (typeof signed !== 'string' || !signed.includes('.')) return null;

  try {
    // base64url → base64 antes do atob (o payload da Meta usa - e _).
    const raw = signed.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(raw));
    return typeof payload?.code === 'string' && payload.code ? payload.code : null;
  } catch {
    return null;
  }
}
