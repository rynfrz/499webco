// A realistic project fixture (the same shape the admin UI saves).
import { blankProject } from '@/lib/projectModel';

export function sampleProject(id = 'p_test1', over = {}) {
  const p = blankProject(id, 'Roofing');
  p.business = {
    ...p.business,
    name: 'Summit Ridge Roofing', type: 'Roofing', city: 'Dacula', state: 'GA', address: '120 Main St, Dacula, GA 30019',
    phone: '(404) 555-0142', email: 'office@summitridge.test', currentUrl: 'https://old.summitridge.test',
    description: 'Summit Ridge Roofing is a family-owned roofing company founded in 2009. We repair and replace residential and commercial roofs across Gwinnett County. Every job is led by an owner, not a salesperson. We photograph our work before and after so you see exactly what was done.',
    tagline: 'Roofs done right, by people who answer the phone',
    hours: 'Mon–Fri 7am–6pm\nSat 8am–1pm',
    services: ['Roof repair - Leaks, storm damage and missing shingles fixed fast', 'Roof replacement', 'Commercial roofing', 'Gutter installation', 'Free inspections'],
    reviews: [
      { text: 'They fixed our leak the same day and showed us photos of everything.', author: 'Maria G.', rating: '5' },
      { text: 'Honest quote, clean crew, great roof.', author: 'Devon P.', rating: '5' },
      { text: 'Third time using Summit Ridge. Always dependable.', author: 'Karen L.', rating: '5' }
    ],
    photos: ['https://img.example.test/a.jpg', 'https://img.example.test/b.jpg', 'https://img.example.test/c.jpg', 'https://img.example.test/d.jpg']
  };
  p.questionnaire.pages = ['About Us', 'Services', 'Contact Us', 'FAQ'];
  Object.assign(p, over);
  return p;
}
