import { notFound } from "next/navigation";
import Image from "next/image"; 
import Link from "next/link";
import { getBlogBySlug, getRelatedBlogs, incrementBlogViews } from "@/actions/blog.actions"; 
import { auth } from "@/lib/auth";
import BlogInteractions from "@/components/blog/BlogInteractions";
import AuthorInfoBlock from "@/components/common/AuthorInfoBlock";
import RelatedBlog from "@/components/blog/RelatedBlogs"; 
import BlogMarkdown from "@/components/blog/BlogMarkdown";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MessageCircle, Eye, Star } from "lucide-react";
import { formatDate } from "@/lib/utils";


export const revalidate = 60;

const APP_URL = process.env.NEXTAUTH_URL || "https://www.stuhive.in";

// 🚀 1. ULTRA HYPER SEO METADATA FOR BLOGS
export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const blog = await getBlogBySlug(resolvedParams.slug, false);
  
  if (!blog) return { title: "Blog Not Found | StuHive", robots: "noindex, nofollow" };
  
  const ogImage = blog.coverImage || `${APP_URL}/default-blog-og.jpg`;

  // Dynamic Keyword Generation based on Title & Tags
  const dynamicKeywords = [
    ...(blog.tags || []),
    blog.title,
    "StuHive Blogs",
    "student community",
    "academic blog",
    "tech blog",
    "university insights",
    "exam strategies"
  ].filter(Boolean);

  return {
    title: `${blog.title} | StuHive Blogs`,
    description: `${blog.summary?.substring(0, 150) || blog.excerpt || 'Read this comprehensive student-written article on StuHive.'}...`,
    keywords: dynamicKeywords,
    authors: [{ name: blog.author?.name || "StuHive Contributor", url: `${APP_URL}/profile/${blog.author?._id}` }],
    creator: blog.author?.name || "StuHive Contributor",
    publisher: "StuHive",
    category: "Education & Technology",
    applicationName: "StuHive",
    alternates: { canonical: `${APP_URL}/blogs/${resolvedParams.slug}` },
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      title: blog.title,
      description: blog.summary,
      url: `${APP_URL}/blogs/${resolvedParams.slug}`,
      siteName: "StuHive",
      type: "article",
      publishedTime: blog.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString(),
      modifiedTime: blog.updatedAt ? new Date(blog.updatedAt).toISOString() : new Date().toISOString(),
      authors: [blog.author?.name || "StuHive Contributor"],
      tags: dynamicKeywords.slice(0, 6),
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: blog.title,
          type: "image/jpeg"
        }
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: blog.title,
      description: blog.summary,
      images: [ogImage],
    }
  };
}

export default async function BlogDetailPage({ params }) {
  const resolvedParams = await params;
  const [session, blog] = await Promise.all([
    auth(),
    getBlogBySlug(resolvedParams.slug)
  ]);

  if (!blog) notFound();

  // Increment views asynchronously
  incrementBlogViews(blog._id).catch(() => {});
  const relatedBlogs = await getRelatedBlogs(blog._id);

  const wordCount = blog.content?.split(/\s+/).length || 0;
  const readTime = blog.readTime || Math.ceil(wordCount / 200) || 3;

  // 🚀 FIXED: Rely entirely on the backend's pre-calculated, accurate database fields
  const totalReviews = blog.numReviews || 0;
  const averageRating = (blog.rating || 0).toFixed(1);

  // 🚀 2. DEEP DUAL JSON-LD INJECTION (Breadcrumb + Enriched BlogPosting)
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": APP_URL },
      { "@type": "ListItem", "position": 2, "name": "Blogs", "item": `${APP_URL}/blogs` },
      { "@type": "ListItem", "position": 3, "name": blog.title, "item": `${APP_URL}/blogs/${resolvedParams.slug}` }
    ]
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${APP_URL}/blogs/${resolvedParams.slug}`
    },
    "headline": blog.title,
    "description": blog.summary,
    "image": [blog.coverImage || `${APP_URL}/default-blog-og.jpg`],
    "datePublished": blog.createdAt,
    "dateModified": blog.updatedAt || blog.createdAt,
    "wordCount": wordCount, // 🚀 SEO: Explicitly telling Google the depth of the content
    "timeRequired": `PT${readTime}M`, // 🚀 SEO: ISO 8601 format for read time
    "keywords": blog.tags?.join(", "),
    "author": { 
      "@type": "Person", 
      "name": blog.author?.name || "StuHive Contributor",
      "url": `${APP_URL}/profile/${blog.author?._id || ''}`
    },
    "publisher": {
      "@type": "Organization",
      "name": "StuHive",
      "logo": { "@type": "ImageObject", "url": `${APP_URL}/logo192.png` }
    },
    "interactionStatistic": [
      {
        "@type": "InteractionCounter",
        "interactionType": "https://schema.org/ViewAction",
        "userInteractionCount": (blog.viewCount || 0) + 1
      },
      {
        "@type": "InteractionCounter",
        "interactionType": "https://schema.org/CommentAction",
        "userInteractionCount": totalReviews
      }
    ]
  };

  return (
    // 🚀 MICRODATA: Tell Google this specific HTML element maps exactly to the BlogPosting schema
    <article className="container max-w-5xl py-12 px-4 sm:px-6" itemScope itemType="https://schema.org/BlogPosting">
      {/* INJECT STRUCTURED DATA */}
      <script key="blog-breadcrumb-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script key="blog-article-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      
      <header className="flex flex-col items-center text-center mb-12 space-y-8">
        
        {/* 🚀 INTERNAL LINKING & TAGS MICRODATA */}
        <nav className="flex flex-wrap justify-center gap-2" aria-label="Tags">
          {blog.tags?.map((tag) => (
            <Link key={tag} href={`/global-search?q=${encodeURIComponent(tag)}`} title={`Search more articles about ${tag}`}>
              <Badge variant="secondary" className="px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-bold shadow-sm bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer">
                <span itemProp="keywords">{tag}</span>
              </Badge>
            </Link>
          ))}
        </nav>

        {/* 🚀 HEADLINE MICRODATA */}
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-[1.1] text-white max-w-4xl" itemProp="headline">
          {blog.title}
        </h1>

        <div className="w-full max-w-4xl bg-white/[0.1] border border-white/30 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
           {/* 🚀 AUTHOR MICRODATA */}
           <address className="not-italic" itemProp="author" itemScope itemType="https://schema.org/Person">
              <AuthorInfoBlock user={blog.author} />
           </address>
           
           <div className="hidden md:block w-px h-12 bg-white/20" />
           <div className="flex flex-wrap items-center justify-center md:justify-end gap-x-6 gap-y-3 text-sm font-medium text-gray-200">
             
             {/* 🚀 DATE PUBLISHED MICRODATA */}
             <span className="flex items-center gap-2" title="Published Date">
               <Calendar className="w-4 h-4 text-primary" aria-hidden="true" />
               <time dateTime={new Date(blog.createdAt).toISOString()} itemProp="datePublished">
                 {formatDate(blog.createdAt)}
               </time>
             </span>
             {blog.updatedAt && <meta itemProp="dateModified" content={new Date(blog.updatedAt).toISOString()} />}
             
             <span className="flex items-center gap-2" title="Estimated Read Time">
               <Clock className="w-4 h-4 text-primary" aria-hidden="true" />
               {readTime} min read
             </span>
             <span className="flex items-center gap-2" title="Total Views">
                <Eye className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                {blog.viewCount + 1 || 1}
             </span>
             {/* Note: We still display the stars in the UI visually, we just don't push them to Google's JSON-LD to prevent the error */}
             <span className="flex items-center gap-2 text-white bg-white/20 px-3 py-1 rounded-full border border-white/30" title="Average Rating">
                <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" aria-hidden="true" />
                <span>
                   {averageRating} <span className="text-white/80 font-normal">({totalReviews})</span>
                </span>
             </span>
           </div>
        </div>
      </header>

      {/* 🚀 IMAGE MICRODATA */}
      {blog.coverImage && (
        <figure className="relative w-full aspect-video mb-20 rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-white/20 bg-white/5">
          <Image
            src={blog.coverImage}
            alt={`Cover image for ${blog.title}`}
            fill
            priority 
            fetchPriority="high"
            unoptimized 
            className="object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
            itemProp="image"
          />
        </figure>
      )}

      {/* 🚀 ARTICLE BODY MICRODATA */}
      {/* Hidden abstract/summary for semantic completeness */}
      <meta itemProp="abstract" content={blog.summary || blog.excerpt || blog.title} />
      
      <section 
        className="max-w-none mb-24 prose prose-invert prose-headings:tracking-tight prose-a:text-cyan-400"
        itemProp="articleBody"
      >
        <BlogMarkdown content={blog.content} title={blog.title} />
      </section>

      <footer className="space-y-16">
        <div className="border-t border-white/20 pt-12">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-2 text-white">
              <MessageCircle className="w-6 h-6 text-primary" aria-hidden="true"/> Discussion
            </h2>
            <div className="bg-white/[0.05] rounded-3xl p-6 md:p-10 border border-white/10">
              <BlogInteractions blogId={blog._id} initialComments={blog.reviews} userId={session?.user?.id} />
            </div>
        </div>

        <section className="border-t border-white/20 pt-12">
          <h2 className="sr-only">Related Articles</h2>
          <RelatedBlog blogs={relatedBlogs} />
        </section>
      </footer>
    </article>
  );
}
