export interface ExplosionEvent {
  x: number;
  y: number;
  radius: number;
  damage: number;
  age: number;
  life: number;
}

export function createExplosion(x: number, y: number, radius: number, damage: number): ExplosionEvent {
  return { x, y, radius, damage, age: 0, life: 0.45 };
}

export function updateExplosions(list: ExplosionEvent[], dt: number): void {
  for (const e of list) e.age += dt;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].age >= list[i].life) list.splice(i, 1);
  }
}
