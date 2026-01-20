type NewsItem = {
  title: string;
  source: string;
};

type NewsListProps = {
  items: NewsItem[];
};

export default function NewsList({ items }: NewsListProps) {
  return (
    <div className="card news-card">
      <div className="card-title">Latest headlines</div>
      <div className="news-list">
        {items.map((item) => (
          <div key={item.title} className="news-item">
            <span className="news-source">{item.source}</span>
            <span className="news-title">{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
