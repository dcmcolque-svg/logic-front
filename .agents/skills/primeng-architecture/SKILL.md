# PrimeNG & TailwindCSS Architecture Skill

## Purpose
Este skill define las pautas arquitectónicas y las mejores prácticas para construir componentes de interfaz de usuario (UI) en el frontend de Binlogic utilizando **Angular 21, PrimeNG 21 y Tailwind CSS v4**, basándose en las pantallas y flujos de usuario diseñados en la fase de UX-Research.

---

## Patrones de UI (Basado en las pantallas diseñadas)

### 1. Theming (Modo Claro / Modo Oscuro)
- **PrimeNG Themes:** El proyecto utiliza `@primeuix/themes`. Los componentes deben adaptarse automáticamente al modo oscuro o claro del sistema o la preferencia del usuario.
- **Integración con Tailwind:** Utilizar el plugin `tailwindcss-primeui` configurado en el proyecto. Esto permite que las clases de utilidad de Tailwind (ej. `bg-surface-0` a `bg-surface-900`) cambien de color mágicamente según el tema activo de PrimeNG.
- **Regla:** **Evitar colores hexadecimales fijos** en Tailwind (ej. `bg-[#1c1c24]`) a menos que sea un render de "Live Preview" que deba permanecer forzosamente blanco (como la tarjeta del correo). En la UI general del dashboard, usar variables de superficie (`bg-surface-900`, `text-surface-0`, etc.).

### 2. Estructura y Layouts (Modales y Pantallas Divididas)
- **Modales (Dialogs):** Para pantallas como "Configuración de SendGrid" o "Editar Plantilla", utilizar el componente `<p-dialog>` de PrimeNG.
  - Asegurar propiedades: `[modal]="true"`, `[dismissableMask]="true"`, y definir un `[style]="{ width: '50vw' }"` responsivo.
  - El contenido interno (Header, Body, Footer) debe estructurarse usando flexbox/grid con Tailwind (ej. `flex flex-col gap-4`).
- **Split Layouts (Ej. Editor No-Code):** Para la vista donde a la izquierda hay un formulario y a la derecha una vista previa, utilizar Tailwind CSS Grid:
  ```html
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
    <div class="form-container overflow-y-auto">...</div>
    <div class="preview-container bg-surface-ground">...</div>
  </div>
  ```

### 3. Formularios e Inputs (Reactive Forms)
Todo manejo de datos debe hacerse mediante **Angular Reactive Forms** (`FormGroup`, `FormControl`).
- **Campos de Texto:** Utilizar `<input pInputText />` dentro de un contenedor flex junto con su `<label>`.
- **Áreas de Texto:** Utilizar `<textarea pTextarea rows="3"></textarea>` para campos extensos como *Instrucciones* o *Avisos de Seguridad*.
- **Selectores (Dropdowns):** Utilizar `<p-dropdown [options]="idiomas" formControlName="idioma" optionLabel="label" optionValue="value"></p-dropdown>` para seleccionar entre "ES" y "EN".
- **Botones:** Utilizar `<p-button label="Guardar" severity="primary"></p-button>`. Para botones de cancelación, utilizar `severity="secondary"` o `[text]="true"`.

### 4. Visualización de Datos
- **Tablas de Gestión (Data Tables):** Para listar las plantillas configuradas, usar `<p-table>`.
  - Aprovechar los templates estructurales: `<ng-template pTemplate="header">` y `<ng-template pTemplate="body">`.
- **Badges/Etiquetas de Estado:** Para marcar una plantilla como "Por Defecto", usar `<p-tag value="Por Defecto" severity="success"></p-tag>`.

### 5. Alertas e Información Visual
- Para mostrar el banner informativo inicial ("Se generará automáticamente una plantilla por defecto en Inglés (EN)"), utilizar el componente `<p-message severity="info" text="..."></p-message>`.

---

## Arquitectura de Componentes (Smart vs. Dumb)

Para features complejos como el gestor de plantillas, separar en:
1.  **Smart Components (Containers):** Se encargan de la inyección de servicios, llamadas a la API (`providers.service.ts`), y gestión del `FormGroup`.
2.  **Dumb Components (Presenters):** Componentes puros de UI. 
    - *Ejemplo Crítico:* La parte derecha del editor (El **Live Preview**) debe ser un componente *Dumb* (`<app-email-template-preview [templateData]="form.value"></app-email-template-preview>`). Solo recibe el objeto con los datos y renderiza el HTML del correo. No hace llamadas a ninguna API.
