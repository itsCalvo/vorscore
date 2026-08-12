(function initBlogPage(){
  let blogPosts = [];
  let activeTopic = 'all';

  const sampleBlogPosts = [
    { title:'How to read football odds before you place a bet', slug:'how-to-read-football-odds', excerpt:'Turn decimal odds into a clearer view of probability, value, and risk.', content:'', category:'explainer', cover_label:'1X2', cover_tone:'gold', reading_minutes:6, published_at:'2026-08-06' },
    { title:'What recent form really tells you about a match', slug:'what-recent-form-really-tells-you', excerpt:'Separate useful signals from noisy streaks when comparing two teams.', content:'', category:'analysis', cover_label:'FORM', cover_tone:'teal', reading_minutes:5, published_at:'2026-08-04' },
    { title:'Banker picks vs accumulators: which fits your approach?', slug:'banker-picks-vs-accumulators', excerpt:'A practical look at confidence, payout, and why fewer picks can be stronger.', content:'', category:'strategy', cover_label:'EDGE', cover_tone:'navy', reading_minutes:4, published_at:'2026-08-02' },
    { title:'Over 2.5 goals explained without the jargon', slug:'over-2-5-goals-explained', excerpt:'Understand goal lines, match context, and the questions to ask before kickoff.', content:'', category:'explainer', cover_label:'2.5', cover_tone:'teal', reading_minutes:5, published_at:'2026-07-30' },
    { title:'Does home advantage still matter?', slug:'does-home-advantage-still-matter', excerpt:'How venue, travel, and crowd pressure can shape a prediction.', content:'', category:'analysis', cover_label:'HOME', cover_tone:'gold', reading_minutes:7, published_at:'2026-07-27' },
    { title:'Build a prediction routine you can actually stick to', slug:'build-a-prediction-routine', excerpt:'Set limits, track results honestly, and make your process more consistent.', content:'', category:'strategy', cover_label:'PLAN', cover_tone:'navy', reading_minutes:3, published_at:'2026-07-24' },
  ];

  function categoryLabel(category){
    return category === 'slip_of_day' ? 'Slip Of The Day' : category.replace(/(^|_)(\w)/g, (_, separator, letter) => (separator ? ' ' : '') + letter.toUpperCase());
  }

  function articleCard(post){
    const searchText = `${post.title} ${post.excerpt} ${post.category}`.toLowerCase();
    return `<article class="article-card" data-topic="${VorScore.escapeHtml(post.category)}" data-search="${VorScore.escapeHtml(searchText)}">
      <div class="article-art ${VorScore.escapeHtml(post.cover_tone || 'navy')}"><span>${VorScore.escapeHtml(post.cover_label || 'GUIDE')}</span></div>
      <div class="article-body"><div class="article-meta">${VorScore.escapeHtml(categoryLabel(post.category))} · ${VorScore.escapeHtml(post.reading_minutes || 5)} min read</div><h2>${VorScore.escapeHtml(post.title)}</h2><p>${VorScore.escapeHtml(post.excerpt)}</p><a class="read-link" href="#articleReader" data-slug="${VorScore.escapeHtml(post.slug)}">Read guide →</a></div>
    </article>`;
  }

  function openArticle(slug){
    const post = blogPosts.find(item => item.slug === slug);
    if(!post) return;
    document.getElementById('readerMeta').textContent = `${categoryLabel(post.category)} · ${post.reading_minutes || 5} min read`;
    document.getElementById('readerTitle').textContent = post.title;
    document.getElementById('readerContent').textContent = post.content || post.excerpt;
    const reader = document.getElementById('articleReader');
    reader.hidden = false;
    reader.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  async function loadBlogPosts(){
    if(supabaseClient){
      const { data, error } = await supabaseClient.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending:false });
      if(!error && data && data.length){
        const liveTitles = new Set(data.map(post => post.title));
        blogPosts = [...data, ...sampleBlogPosts.filter(post => !liveTitles.has(post.title))]
          .sort((first, second) => new Date(second.published_at) - new Date(first.published_at));
      }
    }
    if(!blogPosts.length) blogPosts = sampleBlogPosts;
    const latest = blogPosts.slice(0, 6);
    const archived = blogPosts.slice(6);
    document.getElementById('articleGrid').innerHTML = latest.map(articleCard).join('') || '<p class="blog-empty">No guides published yet.</p>';
    document.getElementById('archiveGrid').innerHTML = archived.map(articleCard).join('');
    document.getElementById('archivesHeading').hidden = archived.length === 0;
  }

  function filterArticles(){
    const query = document.getElementById('articleSearch').value.trim().toLowerCase();
    let visibleCount = 0;
    document.querySelectorAll('.article-card').forEach(card => {
      const matchesTopic = activeTopic === 'all' || card.dataset.topic === activeTopic;
      const matchesSearch = !query || card.dataset.search.includes(query);
      const visible = matchesTopic && matchesSearch;
      card.style.display = visible ? '' : 'none';
      if(visible) visibleCount++;
    });
    document.getElementById('blogEmpty').hidden = visibleCount > 0;
  }

  document.querySelectorAll('.topic-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.topic-btn').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      activeTopic = button.dataset.topic;
      filterArticles();
    });
  });
  document.getElementById('articleSearch').addEventListener('input', filterArticles);
  document.getElementById('articleGrid').addEventListener('click', event => {
    const link = event.target.closest('[data-slug]');
    if(!link) return;
    event.preventDefault();
    openArticle(link.dataset.slug);
  });
  document.getElementById('archiveGrid').addEventListener('click', event => {
    const link = event.target.closest('[data-slug]');
    if(!link) return;
    event.preventDefault();
    openArticle(link.dataset.slug);
  });
  document.getElementById('readerClose').addEventListener('click', () => { document.getElementById('articleReader').hidden = true; });

  loadBlogPosts();
})();
