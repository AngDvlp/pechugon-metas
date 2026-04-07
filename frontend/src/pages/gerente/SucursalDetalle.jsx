// El gerente usa el mismo componente de detalle que el supervisor
// pero con backPath apuntando a /gerente
import SucursalDetalle from '../supervisor/Sucursal'
import styles from '../supervisor/Sucursal.module.css'

export default function GerenteSucursalDetalle() {
  return <SucursalDetalle backPath="/gerente" />
}
