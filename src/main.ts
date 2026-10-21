import './styles.css'
import { UI } from './ui/UI'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
const root = document.querySelector<HTMLElement>('#ui')

if (!canvas || !root) {
  throw new Error('Alberta Drive: #game canvas or #ui overlay is missing from index.html')
}

new UI(root, canvas)
