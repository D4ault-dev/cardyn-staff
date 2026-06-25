import request from '@/utils/request'

// Staff login — uses the tuka staff auth endpoint
export function login(username, password) {
  return request({
    url: '/tuka/staffAuth/login',
    method: 'post',
    data: { username, password }
  })
}

export function getInfo() {
  return request({ url: '/getInfo', method: 'get' })
}

export function logout() {
  return request({ url: '/logout', method: 'post' })
}
