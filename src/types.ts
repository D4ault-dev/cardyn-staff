export type StaffUser = {
  userId: number
  username: string
  nickName: string
  roleType: string
  token: string
}

export type ChatSession = {
  id: number
  userId: number
  userName: string
  orderNo: string | null
  status: 'open' | 'claimed' | 'closed'
  agentId: number | null
  agentName: string | null
  lastMessage: string | null
  unreadCount: number
  updateTime: string
}

export type ChatMessage = {
  id: number
  senderId: number
  senderType: 'user' | 'agent' | 'system'
  senderName: string
  content: string
  msgType: string
  createTime: string
}

export type UserOrder = {
  id: number
  orderNo: string
  categoryName: string
  cardCurrency: string
  cardAmount: number
  ngnAmount: number
  status: string
  createTime: string
}

export type Order = {
  id: number
  orderNo: string
  userId: number
  categoryName: string
  cardCurrency: string
  cardAmount: number
  ngnAmount: number
  totalSettlement: number
  status: string
  rejectReason: string | null
  createTime: string
  finishTime: string | null
  staffId: number | null
  cardImage: string | null
  verifyImage: string | null
  verifyRemark: string | null
  inputType?: string
  quantity?: number
  countryRate?: number
  purchaseRate?: number
  sellRate?: number
  newAmount?: number
  cardCode?: string
}

export type Withdrawal = {
  id: number
  userId: number
  username: string
  withdrawNo: string
  bankName: string
  accountName: string
  accountNo: string
  amount: number
  fee: number
  status: string
  remark: string | null
  receiptImage: string | null
  updateTime: string
  createTime: string
}

export type OnlineStaff = {
  id: number
  userId: number | null
  name: string
  avatar: string | null
  isOnline: boolean
  lastSeen: string | null
  roleType: string
}

export type AppUser = {
  id: number
  phone: string
  email: string
  realName: string
  avatar: string | null
  balance: number
  totalSales: number
  totalWithdrawn: number
  level: number
  tradeCount: number
  status: number
  country: string
  createTime: string
}
