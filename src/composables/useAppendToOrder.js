import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart'
import { updateCustomerOrder } from '../services/moysklad'
import {
  clearOrderEditSession,
  mergeOrderItems,
  useOrderEditSession,
} from '../utils/order-edit-session.js'

export function useAppendToOrder() {
  const cart = useCartStore()
  const router = useRouter()
  const { session } = useOrderEditSession()
  const isAppending = ref(false)
  const appendError = ref('')

  async function appendCartToOrder() {
    if (!session.value || isAppending.value) return
    if (!cart.count) {
      appendError.value = 'Сначала добавьте позиции в корзину'
      return
    }

    isAppending.value = true
    appendError.value = ''
    try {
      const items = mergeOrderItems(
        session.value.items,
        cart.lines.map((line) => ({
          id: line.id,
          name: line.name,
          price: line.price,
          qty: line.qty,
        })),
      )
      await updateCustomerOrder(session.value.orderId, {
        counterpartyId: session.value.counterpartyId,
        items,
      })
      clearOrderEditSession()
      cart.clear()
      router.push('/orders')
    } catch (error) {
      appendError.value =
        error instanceof Error ? error.message : 'Не удалось обновить заказ'
    } finally {
      isAppending.value = false
    }
  }

  return {
    session,
    isAppending,
    appendError,
    appendCartToOrder,
  }
}
