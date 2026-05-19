import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SkillBridge CRM',
    short_name: 'SB CRM',
    description: 'Internal Video Editing CRM for SkillBridge Ladder',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#09090b',
    theme_color: '#09090b',
    // Prevent browser from showing "Add to Home Screen" banner repeatedly
    prefer_related_applications: false,
    categories: ['business', 'productivity'],
    lang: 'en',
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/logo.png',
        type: 'image/png',
        sizes: '512x512',
        // @ts-ignore
        form_factor: 'narrow',
        label: 'SkillBridge CRM Dashboard',
      },
    ],
    shortcuts: [
      {
        name: 'Admin Dashboard',
        short_name: 'Dashboard',
        description: 'Open admin dashboard',
        url: '/admin',
        icons: [{ src: '/logo.png', sizes: '96x96' }],
      },
      {
        name: 'Tasks',
        short_name: 'Tasks',
        description: 'View all tasks',
        url: '/admin/tasks',
        icons: [{ src: '/logo.png', sizes: '96x96' }],
      },
    ],
  };
}
