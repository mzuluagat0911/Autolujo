-- Segunda ejecución, después de 0052.
-- KW 149 (Kowua) ya pagó: paz y salvo y fuera de la flota.

update vehiculos v
set estado = 'pagado'
from empresas e
where v.empresa_id = e.id
  and e.codigo = 'KOWUA'
  and v.numero = '149';

update contratos c
set estado = 'finalizado'
from vehiculos v
join empresas e on e.id = v.empresa_id
where c.vehiculo_id = v.id
  and e.codigo = 'KOWUA'
  and v.numero = '149'
  and c.estado = 'activo';

insert into vehiculo_eventos (vehiculo_id, fecha, tipo, titulo, detalle, origen)
select v.id, '2026-11-09', 'otro', 'Carro pagado', 'paz-y-salvo', 'manual'
from vehiculos v
join empresas e on e.id = v.empresa_id
where e.codigo = 'KOWUA'
  and v.numero = '149'
  and not exists (
    select 1 from vehiculo_eventos ev
    where ev.vehiculo_id = v.id and ev.detalle = 'paz-y-salvo'
  );
